// app/index.js
import { StyleSheet } from 'react-native';
import React from 'react';
import { Redirect, Stack } from 'expo-router';

const Index = () => {
  return (
    <Redirect href="/(authenticate)/login" />
  );
}

export default Index; // Ensure the export matches the component name

const styles = StyleSheet.create({});
