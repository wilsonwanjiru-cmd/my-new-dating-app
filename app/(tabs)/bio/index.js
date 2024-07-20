// app/(tabs)/bio/index.js
import { StyleSheet, Text, View } from 'react-native';
import React from 'react';

const BioScreen = () => {
  return (
    <View style={styles.container}>
      <Text>Bio Screen</Text>
    </View>
  );
}

export default BioScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
