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
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 10,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  pageIdDate: {
    position: 'absolute',
    top: 25,
    right: 30,
    fontSize: 9,
    color: '#666',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  sectionDesc: {
    fontStyle: 'italic',
    fontSize: 9,
    marginBottom: 10,
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
    padding: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 6,
  },
  mcQuestion: {
    fontWeight: 'bold',
    fontSize: 9,
    marginBottom: 4,
  },
  mcOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
    fontSize: 9,
  },
  mcBox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#000',
    marginRight: 5,
    marginTop: 1,
  },
  mcLetter: {
    fontWeight: 'bold',
    marginRight: 5,
    fontSize: 9,
  },
  fibItem: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  index: {
    fontWeight: 'bold',
    marginRight: 5,
  },
  gapLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    width: 100,
    marginHorizontal: 5,
  },
  hint: {
    fontSize: 9,
    fontStyle: 'italic',
    color: '#666',
    marginLeft: 5,
  },
  wordBoxContainer: {
    borderWidth: 2,
    borderColor: '#000',
    padding: 10,
    marginBottom: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
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
    marginBottom: 15,
  },
  transGerman: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  transLineContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  arrow: {
    marginRight: 5,
    fontSize: 14,
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
    fontSize: 9,
    lineHeight: 1.4,
  },
  solutionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 5,
    marginBottom: 10,
  },
  solutionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  solutionCol: {
    width: '48%',
  },
  solutionSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  solutionList: {
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  solutionItem: {
    marginBottom: 3,
    width: '48%',
  }
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
}

const WorksheetPDF: React.FC<WorksheetPDFProps> = ({ exercises, solutions, worksheetId, dateStr }) => {
  return (
    <Document>
      {/* PAGE 1: Multiple Choice */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.pageIdDate} fixed>ID: {worksheetId} - {dateStr}</Text>
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
        <Text style={styles.pageIdDate} fixed>ID: {worksheetId} - {dateStr}</Text>
        <Text style={styles.solutionHeader}>Solution Key (Teacher&apos;s Copy)</Text>

        <View wrap={false}>
          <Text style={styles.solutionSectionTitle}>1. Multiple Choice</Text>
          <View style={styles.solutionList}>
            {exercises.multipleChoice?.map((task, i: number) => {
              const letter = ['A', 'B', 'C'][task.correctIndex] || '?';
              const answer = task.options[task.correctIndex];
              return (
                <Text key={i} style={styles.solutionItem}>
                  <Text style={styles.index}>{i + 1}.</Text> {letter}) {answer}
                </Text>
              );
            })}
          </View>
        </View>

        <View wrap={false}>
          <Text style={styles.solutionSectionTitle}>2. Words in a box</Text>
          <View style={styles.solutionList}>
            {solutions.wordBoxSolutions?.map((sol: string, i: number) => (
              <Text key={i} style={styles.solutionItem}>
                <Text style={styles.index}>{i + 1}.</Text> {sol}
              </Text>
            ))}
          </View>
        </View>

        <View wrap={false}>
          <Text style={styles.solutionSectionTitle}>3. Translation challenge</Text>
          <View style={styles.solutionList}>
            {solutions.translateSolutions?.map((sol: string, i: number) => (
              <Text key={i} style={styles.solutionItem}>
                <Text style={styles.index}>{i + 1}.</Text> {sol}
              </Text>
            ))}
          </View>
        </View>

        <View wrap={false}>
          <Text style={styles.solutionSectionTitle}>4. Fill in the blanks</Text>
          <View style={styles.solutionList}>
            {solutions.fillInTheBlankSolutions?.map((sol: string, i: number) => (
              <Text key={i} style={styles.solutionItem}>
                <Text style={styles.index}>{i + 1}.</Text> {sol}
              </Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default WorksheetPDF;
