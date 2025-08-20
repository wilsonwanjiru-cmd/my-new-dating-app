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
  Platform,
  ScrollView,
  TouchableOpacity
} from "react-native";
import React, { useState, useEffect } from "react";
import { MaterialIcons, AntDesign, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from '../../src/_context/AuthContext';
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("");

  const { login, user } = useAuth();
  const router = useRouter();
  
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://dating-app-3eba.onrender.com";

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (user) {
          router.replace("/(tabs)/bio");
        }
      } catch (error) {
        console.error("Auth check error:", error);
      }
    };
    checkAuth();
  }, [user]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }

    setLoading(true);
    setConnectionStatus("Connecting to Ruda servers...");

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email: email.trim(),
        password: password.trim(),
      }, {
        timeout: 10000, // 10 second timeout
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = response.data;

      if (data.success) {
        // Store tokens and user data
        await AsyncStorage.multiSet([
          ['authToken', data.token],
          ['refreshToken', data.refreshToken],
          ['userId', data.user._id],
          ['userData', JSON.stringify(data.user)],
        ]);

        // Update auth context
        login({
          token: data.token,
          user: data.user,
          isSubscribed: data.user.subscription?.isActive || false,
          subscriptionExpiresAt: data.user.subscription?.expiresAt || null
        });

        setConnectionStatus("Login successful! Redirecting...");
        
        // Add slight delay for better UX
        setTimeout(() => {
          router.replace("/(tabs)/bio");
        }, 500);
      } else {
        throw new Error(data.message || "Login failed");
      }
    } catch (error) {
      handleLoginError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginError = (error) => {
    let errorMessage = "An error occurred during login.";
    let statusMessage = "Error";

    if (error.response) {
      // Server responded with an error status
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      
      if (error.response.status === 400) {
        errorMessage = "Invalid email or password format.";
        statusMessage = "Invalid input";
      } else if (error.response.status === 401) {
        errorMessage = "Invalid email or password.";
        statusMessage = "Authentication failed";
      } else if (error.response.status === 404) {
        errorMessage = "No account found with this email.";
        statusMessage = "Account not found";
      } else if (error.response.status === 500) {
        errorMessage = "Server error. Please try again later.";
        statusMessage = "Server error";
      } else if (error.response.data?.message) {
        errorMessage = error.response.data.message;
      }
    } else if (error.request) {
      // Request was made but no response received
      errorMessage = "Network error. Please check your connection and try again.";
      statusMessage = "Network error";
    } else if (error.message.includes("timeout")) {
      errorMessage = "Connection timeout. Please try again.";
      statusMessage = "Timeout";
    } else {
      errorMessage = error.message || "An unexpected error occurred.";
    }

    setConnectionStatus(statusMessage);
    Alert.alert("Login Failed", errorMessage);
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
        <Text style={styles.appTitle}>Ruda Dating</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {connectionStatus ? (
            <View style={[
              styles.connectionStatus,
              connectionStatus.startsWith("Login successful") 
                ? styles.connectionSuccess 
                : styles.connectionError
            ]}>
              <Text style={styles.connectionStatusText}>
                {connectionStatus}
              </Text>
            </View>
          ) : null}

          <View style={styles.titleContainer}>
            <Text style={styles.loginTitle}>Log in to Ruda Dating</Text>
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
                name="email"
                size={24}
                color="white"
                style={styles.icon}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email Address"
                placeholderTextColor="#FFFFFFAA"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!loading}
                inputMode="email"
              />
            </View>

            <View style={styles.passwordContainer}>
              <AntDesign
                name="lock1"
                size={24}
                color="white"
                style={styles.icon}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Password"
                style={styles.passwordInput}
                placeholderTextColor="#FFFFFFAA"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleLogin}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={24}
                  color="white"
                />
              </TouchableOpacity>
            </View>

            <Pressable
              onPress={() => !loading && router.push("/forgot-password")}
              disabled={loading}
              style={styles.forgotPasswordContainer}
            >
              <Text style={styles.forgotPassword}>Forgot Password?</Text>
            </Pressable>

            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={[styles.loginButton, loading && styles.disabledButton]}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.loginButtonText}>Login</Text>
              )}
            </Pressable>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={styles.googleButton}
              disabled={loading}
            >
              <Image
                source={{ uri: "https://cdn-icons-png.flaticon.com/128/300/300221.png" }}
                style={styles.googleIcon}
              />
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </Pressable>

            <View style={styles.signUpContainer}>
              <Text style={styles.signUpText}>
                Don't have an account?{" "}
                <Pressable onPress={() => router.replace("/register")}>
                  <Text style={styles.signUpLink}>Create Account</Text>
                </Pressable>
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    height: 200,
    backgroundColor: "#FF69B4",
    width: "100%",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
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
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    textShadowColor: "rgba(0,0,0,0.1)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  keyboardView: {
    flex: 1,
    width: "100%",
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  connectionStatus: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
  },
  connectionSuccess: {
    backgroundColor: "#e8f5e9",
    borderColor: "#4CAF50",
  },
  connectionError: {
    backgroundColor: "#ffebee",
    borderColor: "#F44336",
  },
  connectionStatusText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "500",
  },
  titleContainer: {
    alignItems: "center",
    marginTop: 10,
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FF1493",
    marginBottom: 5,
  },
  imageContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  loginImage: {
    width: 120,
    height: 100,
    resizeMode: "contain",
  },
  formContainer: {
    marginTop: 10,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFB6C1",
    paddingVertical: 8,
    borderRadius: 15,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#FF69B4",
    paddingHorizontal: 15,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFB6C1",
    paddingVertical: 8,
    borderRadius: 15,
    marginTop: 20,
    position: "relative",
    borderWidth: 1,
    borderColor: "#FF69B4",
    paddingHorizontal: 15,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: "white",
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 8,
  },
  passwordInput: {
    flex: 1,
    color: "white",
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 8,
    paddingRight: 40,
  },
  eyeIcon: {
    position: "absolute",
    right: 15,
    padding: 8,
  },
  forgotPasswordContainer: {
    marginTop: 15,
    alignItems: "flex-end",
  },
  forgotPassword: {
    color: "#FF69B4",
    fontWeight: "600",
    fontSize: 15,
  },
  loginButton: {
    width: "100%",
    backgroundColor: "#FF1493",
    borderRadius: 15,
    marginTop: 30,
    padding: 16,
    alignItems: "center",
    shadowColor: "#FF1493",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  disabledButton: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 25,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#FFB6C1",
  },
  dividerText: {
    paddingHorizontal: 10,
    color: "#FF69B4",
    fontWeight: "500",
    fontSize: 14,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#FFB6C1",
    borderRadius: 15,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  googleButtonText: {
    color: "#444",
    fontSize: 16,
    fontWeight: "500",
  },
  signUpContainer: {
    marginTop: 25,
    alignItems: "center",
  },
  signUpText: {
    color: "#666",
    fontSize: 16,
    textAlign: "center",
  },
  signUpLink: {
    color: "#FF1493",
    fontWeight: "bold",
    marginLeft: 5,
  },
});

export default Login;