import sys

with open('./src/components/CsvImportModal.tsx', 'r') as f:
    content = f.read()

search = """            // Process in batches to avoid huge payloads and long timeouts
            const batchSize = 30;
            const enrichedResults: any[] = [];

            for (let i = 0; i < cardsToEnrich.length; i += batchSize) {
              const batch = cardsToEnrich.slice(i, i + batchSize);

              setProgress(Math.round(((i) / cardsToEnrich.length) * 100))
              setProgressText(`Generiere KI-Felder (Batch ${Math.floor(i/batchSize)+1}/${Math.ceil(cardsToEnrich.length/batchSize)})...`)

              const reqBody = {
                cards: batch.map(c => ({ id: c.id, front: c.front, back: c.back }))
              };

              const res = await fetch("/api/enrich-csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqBody)
              });

              if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Fehler bei der KI-Generierung");
              }

              const data = await res.json();
              enrichedResults.push(...data.cards);
            }"""

replace = """            // Process in batches to avoid huge payloads and long timeouts
            const batchSize = 30;
            const totalBatches = Math.ceil(cardsToEnrich.length / batchSize);
            let completedBatches = 0;

            const batchPromises = [];

            for (let i = 0; i < cardsToEnrich.length; i += batchSize) {
              const batch = cardsToEnrich.slice(i, i + batchSize);

              const reqBody = {
                cards: batch.map(c => ({ id: c.id, front: c.front, back: c.back }))
              };

              const promise = fetch("/api/enrich-csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqBody)
              }).then(async (res) => {
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  throw new Error(data.error || "Fehler bei der KI-Generierung");
                }
                const data = await res.json();

                completedBatches++;
                setProgress(Math.round((completedBatches / totalBatches) * 100));
                setProgressText(`Generiere KI-Felder (Batch ${completedBatches}/${totalBatches})...`);

                return data.cards;
              });

              batchPromises.push(promise);
            }

            setProgressText(`Generiere KI-Felder (0/${totalBatches})...`);
            setProgress(0);

            const resultsArray = await Promise.all(batchPromises);
            const enrichedResults = resultsArray.flat();"""

if search in content:
    content = content.replace(search, replace)
    with open('./src/components/CsvImportModal.tsx', 'w') as f:
        f.write(content)
    print("Success")
else:
    print("Search string not found")
