// frontend/index.js
import React from "react";
import { Redirect } from "expo-router";

const Index = () => {
  // Redirect to the login screen when the app starts
  return <Redirect href="/(authenticate)/login" />;
};

export default Index;
