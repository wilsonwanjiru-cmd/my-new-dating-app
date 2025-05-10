import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  Image,
  KeyboardAvoidingView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform
} from "react-native";
import React, { useState, useEffect } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../utils/service";

const Login = () => {
  const [email, setEmail] = useState("wilsonmuita41@gmail.com"); // Pre-filled for testing
  const [password, setPassword] = useState("WilsonWanjiru@2021"); // Pre-filled for testing
  const [loading, setLoading] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState("");
  const router = useRouter();

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const token = await AsyncStorage.getItem("auth");
        if (token) {
          router.replace("/(tabs)/profile");
        }
      } catch (error) {
        console.log("Error checking login status:", error);
      }
    };
    checkLoginStatus();
  }, []);

  const testNetworkConnection = async (url, timeout = 5000) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn(`Connection test failed for ${url}:`, error.message);
      return false;
    }
  };

  const testAllPossibleConnections = async () => {
    const connectionTests = [
      { url: `${api.defaults.baseURL}/api/health`, name: "Primary API" },
      { url: `http://localhost:5000/api/health`, name: "Localhost" },
      { url: `http://${getLocalIP()}:5000/api/health`, name: "Local IP" }
    ];

    for (const test of connectionTests) {
      const isConnected = await testNetworkConnection(test.url);
      if (isConnected) {
        setConnectionDetails(`Connected via ${test.name}`);
        return true;
      }
    }
    
    setConnectionDetails("All connection attempts failed");
    return false;
  };

  const getLocalIP = () => {
    // Replace with your actual local IP address
    return "192.168.1.100"; // Example: change this to your real local IP
  };

  const handleLoginError = (error) => {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      name: error.name,
      message: error.message,
      code: error.code,
      config: {
        baseURL: api.defaults.baseURL,
        url: error.config?.url,
        method: error.config?.method
      },
      connectionDetails
    };

    console.error("Login error details:", JSON.stringify(errorDetails, null, 2));

    let errorTitle = "Connection Error";
    let errorMessage = "";
    let showRetry = true;

    if (error.message === "BACKEND_UNREACHABLE") {
      errorMessage = `Cannot reach our servers at:\n${api.defaults.baseURL}\n\nPlease:\n1. Verify your computer and phone are on the same WiFi\n2. Check your local IP is correct\n3. Try again`;
    } else if (error.code === "ERR_NETWORK") {
      errorMessage = "Network connection failed. Please check your internet connection.";
    } else if (error.response) {
      errorTitle = "Server Error";
      errorMessage = error.response.data?.message || `Server responded with status ${error.response.status}`;
      showRetry = false;
    } else {
      errorMessage = "An unexpected error occurred. Please try again.";
    }

    Alert.alert(
      errorTitle,
      errorMessage,
      showRetry ? [
        { text: "Cancel", style: "cancel" },
        { text: "Retry", onPress: handleLogin }
      ] : [{ text: "OK" }]
    );

    setNetworkError(true);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }

    setLoading(true);
    setNetworkError(false);
    setConnectionDetails("Testing connection...");

    try {
      // First check basic internet connectivity
      const hasInternet = await testNetworkConnection('https://www.google.com');
      if (!hasInternet) {
        throw new Error("NO_INTERNET");
      }

      // Then check backend specifically
      const backendAvailable = await testAllPossibleConnections();
      if (!backendAvailable) {
        throw new Error("BACKEND_UNREACHABLE");
      }

      console.log("Attempting login to:", api.defaults.baseURL);
      
      const response = await api.post(
        "/api/auth/login",
        {
          email: email.trim(),
          password: password.trim(),
        },
        {
          headers: { 
            'Content-Type': 'application/json',
            'X-Debug-Source': 'Expo-App' 
          },
          timeout: 15000
        }
      );

      await AsyncStorage.multiSet([
        ["auth", response.data.token],
        ["user", JSON.stringify(response.data.user || {})]
      ]);

      router.replace("/(authenticate)/select");
    } catch (error) {
      handleLoginError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image
            style={styles.logo}
            source={{
              uri: "https://cdn-icons-png.flaticon.com/128/6655/6655045.png",
            }}
          />
        </View>
        <Text style={styles.appTitle}>Match Mate</Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        {networkError && (
          <View style={styles.networkWarning}>
            <Text style={styles.networkWarningText}>⚠️ Connection Issues Detected</Text>
            <Text style={styles.connectionDetailsText}>{connectionDetails}</Text>
          </View>
        )}

        <View style={styles.titleContainer}>
          <Text style={styles.loginTitle}>Log in to your Account</Text>
        </View>

        <View style={styles.imageContainer}>
          <Image
            style={styles.loginImage}
            source={{
              uri: "https://cdn-icons-png.flaticon.com/128/2509/2509078.png",
            }}
          />
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <MaterialIcons
              style={styles.icon}
              name="email"
              size={24}
              color="white"
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor="#FFFFFFAA"
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <AntDesign
              style={styles.icon}
              name="lock1"
              size={24}
              color="white"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              placeholder="Enter your password"
              style={styles.input}
              placeholderTextColor="#FFFFFFAA"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleLogin}
              editable={!loading}
            />
          </View>

          <View style={styles.optionsContainer}>
            <Text style={styles.rememberText}>Keep me logged in</Text>
            <Pressable 
              onPress={() => !loading && router.push("/forgot-password")}
              disabled={loading}
            >
              <Text style={styles.forgotPassword}>Forgot Password</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={[styles.loginButton, loading && styles.disabledButton]}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </Pressable>

          {!loading && (
            <Pressable
              onPress={() => router.replace("/register")}
              style={styles.signUpContainer}
            >
              <Text style={styles.signUpText}>
                Don't have an account? <Text style={styles.signUpLink}>Sign Up</Text>
              </Text>
            </Pressable>
          )}

          {/* Debug information - visible in development only */}
          {__DEV__ && (
            <View style={styles.debugContainer}>
              <Text style={styles.debugText}>API Base: {api.defaults.baseURL}</Text>
              <Text style={styles.debugText}>Connection: {connectionDetails}</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    alignItems: "center",
  },
  header: {
    height: 200,
    backgroundColor: "pink",
    width: "100%",
  },
  logoContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
  },
  logo: {
    width: 150,
    height: 80,
    resizeMode: "contain",
  },
  appTitle: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 20,
    fontFamily: "GillSans-SemiBold",
  },
  keyboardView: {
    width: "100%",
    paddingHorizontal: 20,
  },
  networkWarning: {
    backgroundColor: '#FFF3CD',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    borderLeftWidth: 5,
    borderLeftColor: '#FFC107',
  },
  networkWarningText: {
    color: '#856404',
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 14,
  },
  connectionDetailsText: {
    color: '#856404',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 5,
  },
  titleContainer: {
    alignItems: "center",
    marginTop: 25,
  },
  loginTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#F9629F",
  },
  imageContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  loginImage: {
    width: 100,
    height: 80,
    resizeMode: "cover",
  },
  formContainer: {
    marginTop: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFC0CB",
    paddingVertical: 5,
    borderRadius: 5,
    marginTop: 30,
  },
  icon: {
    marginLeft: 8,
  },
  input: {
    color: "white",
    marginVertical: 10,
    width: "80%",
    fontSize: 17,
  },
  optionsContainer: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rememberText: {
    color: "#666",
  },
  forgotPassword: {
    color: "#007FFF",
    fontWeight: "500",
  },
  loginButton: {
    width: "100%",
    backgroundColor: "#FFC0CB",
    borderRadius: 6,
    marginTop: 50,
    padding: 15,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  signUpContainer: {
    marginTop: 12,
    alignItems: "center",
  },
  signUpText: {
    color: "gray",
    fontSize: 16,
  },
  signUpLink: {
    color: "#007FFF",
    fontWeight: "500",
  },
  debugContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
  },
  debugText: {
    fontSize: 12,
    color: '#666',
  },
});

export default Login;