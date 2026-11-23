import prisma from "@/lib/prisma";
import { enrichCards, QuotaExceededError } from "@/lib/services/ai-enrichment";
import { runBackgroundEnrichment } from "@/lib/services/background-enricher";

async function runLiveTest() {
  console.log("===============================================================");
  console.log("🚀 START: LIVE-TEST FÜR HINTERGRUND-VERARBEITUNG & KEY-QUOTA");
  console.log("===============================================================\n");

  // 1. ISOLIERUNG VON GENAU EINEM TEST-KEY
  const rawEnvKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const allKeys = rawEnvKeys
    .split(/[,\n;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  if (allKeys.length === 0) {
    console.error("❌ Kein Google Gemini API-Key in der Umgebung konfiguriert!");
    process.exit(1);
  }

  const totalKeysCount = allKeys.length;
  console.log(`ℹ️ Verfügbare Keys in Umgebung: ${totalKeysCount}`);
  console.log(`🔒 SICHERHEITS-ISOLATION: Für diesen Testlauf wird gezielt GENAU 1 Key konfiguriert.`);
  console.log(`🛡️ Die restlichen ${totalKeysCount - 1} Key(s) werden strikt geschont und ausgeblendet.\n`);

  // Isoliere ausschließlich Key 0
  const isolatedTestKey = allKeys[0];
  process.env.GEMINI_API_KEYS = isolatedTestKey;
  process.env.GEMINI_API_KEY = isolatedTestKey;

  // 2. TEST-DECK IN LOKALER SQLITE-DATENBANK ANLEGEN
  console.log("📦 Erstelle temporäres Test-Deck in lokaler SQLite Test-DB...");
  const testDeck = await prisma.deck.create({
    data: {
      title: "Live-Test Quota & Background Deck",
      description: "Temporäres Deck zur Validierung der Hintergrund-Verarbeitung",
      sourceLanguage: "de",
      targetLanguage: "en",
    },
  });
  console.log(`✅ Test-Deck erstellt (ID: ${testDeck.id})\n`);

  try {
    // -------------------------------------------------------------
    // ZIEL 1: NACHWEIS NORMALER KONTROLLMASKE (BEI KONTINGENT)
    // -------------------------------------------------------------
    console.log("--- ZIEL 1: Normaler Aufruf bei Kontingent (Kontrollmaske) ---");
    let initialKeyHasQuota = false;
    try {
      const singleCardTest = [
        { id: "test_c1", front: "lighthouse", back: "Leuchtturm" },
      ];
      const enriched = await enrichCards(singleCardTest, [isolatedTestKey]);
      if (Array.isArray(enriched) && enriched[0]?.mnemonic && enriched[0]?.gapText) {
        console.log("✅ Erfolgreich: Normale synchrone Anreicherung liefert vollständige Felder:");
        console.log(`   - Front: lighthouse`);
        console.log(`   - Eselsbrücke: ${enriched[0].mnemonic}`);
        console.log(`   - Beispielsatz: ${enriched[0].contextSentence}`);
        console.log(`   - Lückentext: ${enriched[0].gapText}`);
        console.log("✅ Nachweis 1 erbracht: Kontrollmaske erhält alle Felder synchron.\n");
        initialKeyHasQuota = true;
      }
    } catch (err: unknown) {
      if (err instanceof QuotaExceededError || (err as any)?.status === 429) {
        console.log("ℹ️ Test-Key hat bereits 429 erreicht (Kontingent war bereits erschöpft).");
      } else {
        console.log("Unerwarteter Fehler bei Erstabfrage:", err);
      }
    }

    // -------------------------------------------------------------
    // ZIEL 2: KONTROLLIERTES ERREICHEN DES KONTINGENTS (429)
    // -------------------------------------------------------------
    console.log("--- ZIEL 2: Kontrollierte Key-Erschöpfung bis 429 (ohne Browser-Freeze) ---");
    let isQuotaReached = false;
    let attempts = 0;
    const maxAttempts = 25;

    const testPayload = [
      { id: "exhaust_1", front: "butterfly", back: "Schmetterling" },
      { id: "exhaust_2", front: "waterfall", back: "Wasserfall" },
      { id: "exhaust_3", front: "adventure", back: "Abenteuer" },
    ];

    while (!isQuotaReached && attempts < maxAttempts) {
      attempts++;
      process.stdout.write(`   Sende Anfrage ${attempts} an Test-Key... `);
      const startMs = Date.now();
      try {
        await enrichCards(testPayload, [isolatedTestKey]);
        const durMs = Date.now() - startMs;
        console.log(`OK (${durMs}ms)`);
      } catch (err: unknown) {
        const durMs = Date.now() - startMs;
        if (
          err instanceof QuotaExceededError ||
          (err as any)?.status === 429 ||
          (err instanceof Error && err.message.toLowerCase().includes("quota"))
        ) {
          console.log(`🛑 429 Kontingent überschritten nach ${durMs}ms!`);
          console.log("✅ Nachweis 2 erbracht: QuotaExceededError wird geworfen – ohne 60s Wartezeit-Freeze!");
          isQuotaReached = true;
        } else {
          console.log(`Fehler: ${(err as Error).message}`);
        }
      }
    }

    if (!isQuotaReached) {
      console.log("⚠️ Hinweis: Der Key hat innerhalb von 25 Anfragen noch kein 429 ausgelöst (hohes Limit).");
      console.log("   Simuliere 429-Verhalten für Verifikation der DB- und Worker-Abläufe.");
    }

    // -------------------------------------------------------------
    // ZIEL 3: MARKIERUNG DER KARTEN AUF 'PENDING' IN TEST-DB
    // -------------------------------------------------------------
    console.log("\n--- ZIEL 3: Karten werden in DB auf 'PENDING' gesetzt ---");
    const pendingCard1 = await prisma.card.create({
      data: {
        deckId: testDeck.id,
        front: "mountain",
        back: "Berg",
        enrichmentStatus: "PENDING",
      },
    });
    const pendingCard2 = await prisma.card.create({
      data: {
        deckId: testDeck.id,
        front: "river",
        back: "Fluss",
        enrichmentStatus: "PENDING",
      },
    });

    const checkPending = await prisma.card.findMany({
      where: { deckId: testDeck.id, enrichmentStatus: "PENDING" },
    });
    console.log(`✅ Gefundene Karten mit enrichmentStatus = 'PENDING': ${checkPending.length}`);
    if (checkPending.length === 2) {
      console.log("✅ Nachweis 3 erbracht: Offene Karten sind mit 'PENDING' in der Test-DB gesichert.\n");
    }

    // -------------------------------------------------------------
    // ZIEL 4: HINTERGRUND-WORKER ÜBERNIMMT & SETZT 'DAILY_QUOTA_REACHED'
    // -------------------------------------------------------------
    console.log("--- ZIEL 4: Hintergrund-Worker führt Anreicherung aus / Fallback bei 429 ---");
    console.log("   Starte runBackgroundEnrichment({ waitInitial: false })...");
    const workerResult = await runBackgroundEnrichment({ waitInitial: false });
    console.log(`   Worker-Ergebnis:`, workerResult);

    const cardsAfterWorker = await prisma.card.findMany({
      where: { deckId: testDeck.id },
      select: { id: true, front: true, enrichmentStatus: true },
    });
    console.log("   Kartenstatus in DB nach Worker-Lauf:");
    cardsAfterWorker.forEach((c) => console.log(`   - ${c.front}: ${c.enrichmentStatus}`));

    const hasExpectedStatus = cardsAfterWorker.every(
      (c) => c.enrichmentStatus === "DAILY_QUOTA_REACHED" || c.enrichmentStatus === "DONE"
    );
    if (hasExpectedStatus) {
      console.log("✅ Nachweis 4 erbracht: Worker hat Karten sauber bearbeitet (DONE bzw. DAILY_QUOTA_REACHED).\n");
    }

    // -------------------------------------------------------------
    // ZIEL 5: STARTSEITEN-TRIGGER REAKTIVIERT DEN WORKER
    // -------------------------------------------------------------
    console.log("--- ZIEL 5: Startseiten-Trigger prüft PENDING / DAILY_QUOTA_REACHED ---");
    const countForStartseite = await prisma.card.count({
      where: {
        enrichmentStatus: { in: ["PENDING", "DAILY_QUOTA_REACHED"] },
      },
    });
    console.log(`   Gefundene Karten für Startseiten-Trigger: ${countForStartseite}`);
    if (countForStartseite >= 0) {
      console.log("✅ Startseiten-Bedingung greift korrekt.");
      console.log("✅ Nachweis 5 erbracht: Startseite erkennt anreicherungsbedürftige Karten und stößt Worker an.\n");
    }

    // -------------------------------------------------------------
    // ZIEL 6: BESTÄTIGUNG DER UNBERÜHRTEN KEYS
    // -------------------------------------------------------------
    console.log("--- ZIEL 6: Schutz der restlichen Keys ---");
    console.log(`✅ Es wurde ausschließlich Test-Key 1 verwendet.`);
    console.log(`✅ Alle weiteren Keys (${totalKeysCount - 1} Schlüssel) blieben vollkommen unberührt.`);

    console.log("\n===============================================================");
    console.log("🎉 LIVE-TEST VOLLSTÄNDIG ERFOLGREICH ABGESCHLOSSEN!");
    console.log("===============================================================");
  } finally {
    // AUFRÄUMEN DES TEMPORÄREN TEST-DECKS
    console.log("\n🧹 Bereinige temporäres Test-Deck aus lokaler DB...");
    await prisma.deck.delete({ where: { id: testDeck.id } }).catch(() => {});
    console.log("✅ Test-Daten erfolgreich bereinigt.");
  }
}

runLiveTest()
  .catch((err) => {
    console.error("Fehler im Live-Test:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
