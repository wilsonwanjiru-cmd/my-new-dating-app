// app/index.js
import { StyleSheet } from 'react-native';
import React from 'react';
import { Redirect, Stack } from 'expo-router';

const Index = () => {
  return (
    <Redirect href="/(tabs)/profile" />
  );
}

export default Index;

const styles = StyleSheet.create({});
