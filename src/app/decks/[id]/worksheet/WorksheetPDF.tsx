import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Register fonts
Font.register({
  family: 'Open Sans',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/npm/open-sans-all@0.1.3/fonts/open-sans-regular.ttf' },
    { src: 'https://cdn.jsdelivr.net/npm/open-sans-all@0.1.3/fonts/open-sans-700.ttf', fontWeight: 700 },
    { src: 'https://cdn.jsdelivr.net/npm/open-sans-all@0.1.3/fonts/open-sans-italic.ttf', fontStyle: 'italic' }
  ]
});

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 25,
    fontFamily: 'Open Sans',
    fontSize: 9,
    lineHeight: 1.35,
  },
  header: {
    paddingBottom: 4,
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#000',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
    paddingTop: 2,
  },
  pageIdDate: {
    position: 'absolute',
    top: 25,
    right: 30,
    fontSize: 9,
    color: '#666',
    textAlign: 'right',
    maxWidth: 320,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionDesc: {
    fontStyle: 'italic',
    fontSize: 8.5,
    marginBottom: 6,
    color: '#333',
  },
  mcGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mcItem: {
    width: '48%',
    backgroundColor: '#f9fafb',
    padding: 5.8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 6.5,
  },
  mcQuestion: {
    fontWeight: 'bold',
    fontSize: 8.5,
    marginBottom: 2.5,
  },
  mcOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
    fontSize: 8.5,
  },
  mcBox: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: '#000',
    marginRight: 5,
    marginTop: 1,
  },
  mcLetter: {
    fontWeight: 'bold',
    marginRight: 4,
    fontSize: 8.5,
  },
  fibItem: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  index: {
    fontWeight: 'bold',
    marginRight: 4,
  },
  gapLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    width: 90,
    marginHorizontal: 4,
  },
  hint: {
    fontSize: 8.5,
    fontStyle: 'italic',
    color: '#666',
    marginLeft: 4,
  },
  wordBoxContainer: {
    borderWidth: 1.5,
    borderColor: '#000',
    padding: 8,
    marginBottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  wordBoxItem: {
    fontWeight: 'bold',
    fontSize: 9,
  },
  transGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  transItem: {
    width: '48%',
    marginBottom: 9,
  },
  transGerman: {
    fontWeight: 'bold',
    marginBottom: 3,
  },
  transLineContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  arrow: {
    marginRight: 4,
    fontSize: 12,
  },
  transLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    flex: 1,
    marginLeft: 2,
  },
  solutionPage: {
    padding: 25,
    fontFamily: 'Open Sans',
    fontSize: 8.5,
    lineHeight: 1.35,
  },
  solutionHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 4,
    marginBottom: 10,
  },
  columnsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leftCol: {
    width: '48%',
  },
  rightCol: {
    width: '49%',
  },
  solutionSectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 5,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 2,
  },
  twoColList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  twoColItem: {
    width: '48%',
    marginBottom: 4,
  },
  singleColList: {
    flexDirection: 'column',
  },
  singleColItem: {
    marginBottom: 5,
  },
});

interface WorksheetData {
  multipleChoice: {
    question: string;
    options: string[];
    correctIndex: number;
  }[];
  fillInTheBlank: {
    sentenceBeforeGap: string;
    sentenceAfterGap: string;
    germanHint: string;
    answer: string;
  }[];
  wordBoxWords: string[];
  wordBoxSentences: {
    sentenceBeforeGap: string;
    sentenceAfterGap: string;
    answer: string;
  }[];
  translateSentences: {
    germanSentence: string;
    englishFirstLetter: string;
    answer: string;
  }[];
}

interface SolutionData {
  fillInTheBlankSolutions: string[];
  wordBoxSolutions: string[];
  translateSolutions: string[];
}

interface WorksheetPDFProps {
  exercises: WorksheetData;
  solutions: SolutionData;
  worksheetId: string;
  dateStr: string;
  deckName?: string;
  onRender?: (params: any) => void;
}

const WorksheetPDF: React.FC<WorksheetPDFProps> = ({ exercises, solutions, worksheetId, dateStr, deckName, onRender }) => {
  const cleanDeckName = deckName?.trim();
  const headerInfo = cleanDeckName ? `${cleanDeckName} - ID: ${worksheetId} - ${dateStr}` : `ID: ${worksheetId} - ${dateStr}`;
  const docTitle = cleanDeckName ? `${cleanDeckName} - ${worksheetId}` : worksheetId;

  return (
    <Document title={docTitle} onRender={onRender}>
      {/* PAGE 1: Multiple Choice */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.pageIdDate} fixed>{headerInfo}</Text>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Vocabulary Worksheet</Text>
        </View>

        {/* 1. Multiple Choice */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Multiple Choice</Text>
          <Text style={styles.sectionDesc}>Welcher Satz ist grammatikalisch und inhaltlich richtig? Kreuze an.</Text>
          <View style={styles.mcGrid}>
            {exercises.multipleChoice?.map((task, i: number) => (
              <View key={i} style={styles.mcItem} wrap={false}>
                <Text style={styles.mcQuestion}>{i + 1}. {task.question}</Text>
                {task.options.map((opt: string, j: number) => (
                  <View key={j} style={styles.mcOption}>
                    <View style={styles.mcBox} />
                    <Text style={styles.mcLetter}>{['A', 'B', 'C'][j]}</Text>
                    <View style={{ flex: 1 }}><Text>{opt}</Text></View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>

        {/* 2. Words in a box */}
        <View style={styles.section} break>
          <Text style={styles.sectionTitle}>2. Words in a box</Text>
          <Text style={styles.sectionDesc}>Setze die richtigen Wörter aus der Box in die Sätze ein.</Text>

          <View style={styles.wordBoxContainer}>
            {exercises.wordBoxWords?.map((word: string, i: number) => (
              <Text key={i} style={styles.wordBoxItem}>{word}</Text>
            ))}
          </View>

          <View>
            {exercises.wordBoxSentences?.map((task, i: number) => (
              <View key={i} style={styles.fibItem} wrap={false}>
                <Text style={styles.index}>{i + 1}.</Text>
                <Text>{task.sentenceBeforeGap}</Text>
                <View style={styles.gapLine} />
                <Text>{task.sentenceAfterGap}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 3. Translation challenge */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Translation challenge</Text>
          <Text style={styles.sectionDesc}>Übersetze die Sätze ins Englische. Der Anfangsbuchstabe des gesuchten Wortes ist vorgegeben.</Text>
          <View style={styles.transGrid}>
            {exercises.translateSentences?.map((task, i: number) => (
              <View key={i} style={styles.transItem} wrap={false}>
                <Text style={styles.transGerman}>{i + 1}. {task.germanSentence}</Text>
                <View style={styles.transLineContainer}>
                  <Text style={styles.arrow}>-&gt;</Text>
                  <Text style={{ fontWeight: 'bold' }}>{task.englishFirstLetter}</Text>
                  <View style={styles.transLine} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 4. Fill in the blanks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Fill in the blanks</Text>
          <Text style={styles.sectionDesc}>Fülle die Lücken mit den passenden englischen Wörtern. Nutze den deutschen Hinweis.</Text>
          <View>
            {exercises.fillInTheBlank?.map((task, i: number) => (
              <View key={i} style={styles.fibItem} wrap={false}>
                <Text style={styles.index}>{i + 1}.</Text>
                <Text>{task.sentenceBeforeGap}</Text>
                <View style={styles.gapLine} />
                <Text>{task.sentenceAfterGap}</Text>
                <Text style={styles.hint}>({task.germanHint})</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>

      {/* PAGE 4: Solutions Page */}
      <Page size="A4" style={styles.solutionPage}>
        <Text style={styles.pageIdDate} fixed>{headerInfo}</Text>
        <Text style={styles.solutionHeader}>Solution Key (Teacher&apos;s Copy)</Text>

        <View style={styles.columnsContainer}>
          {/* Left Column: 1. MC, 2. Words in a box, 4. Fill in the blanks */}
          <View style={styles.leftCol}>
            <View>
              <Text style={styles.solutionSectionTitle}>1. Multiple Choice</Text>
              <View style={styles.twoColList}>
                {exercises.multipleChoice?.map((task, i: number) => {
                  const letter = ['A', 'B', 'C'][task.correctIndex] || '?';
                  const answer = task.options[task.correctIndex] || '';
                  return (
                    <Text key={i} style={styles.twoColItem}>
                      <Text style={styles.index}>{i + 1}.</Text> {letter}) {answer}
                    </Text>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={styles.solutionSectionTitle}>2. Words in a box</Text>
              <View style={styles.twoColList}>
                {solutions.wordBoxSolutions?.map((sol: string, i: number) => (
                  <Text key={i} style={styles.twoColItem}>
                    <Text style={styles.index}>{i + 1}.</Text> {sol}
                  </Text>
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.solutionSectionTitle}>4. Fill in the blanks</Text>
              <View style={styles.twoColList}>
                {solutions.fillInTheBlankSolutions?.map((sol: string, i: number) => (
                  <Text key={i} style={styles.twoColItem}>
                    <Text style={styles.index}>{i + 1}.</Text> {sol}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          {/* Right Column: 3. Translation challenge */}
          <View style={styles.rightCol}>
            <View>
              <Text style={styles.solutionSectionTitle}>3. Translation challenge</Text>
              <View style={styles.singleColList}>
                {solutions.translateSolutions?.map((sol: string, i: number) => (
                  <Text key={i} style={styles.singleColItem}>
                    <Text style={styles.index}>{i + 1}.</Text> {sol}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default WorksheetPDF;
