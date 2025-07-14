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
import React, { useState, useEffect, useContext } from "react";
import { MaterialIcons, AntDesign, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../_config";
import { AuthContext } from '../_context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("");

  const { setUser, setToken, setIsSubscribed, setSubscriptionExpiresAt } =
    useContext(AuthContext);

  const router = useRouter();
  const CONNECTION_TIMEOUT = 15000;

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem("auth");
        if (token) {
          router.replace("/(tabs)/profile");
        }
      } catch (error) {
        console.error("Auth check error:", error);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }

    setLoading(true);
    setConnectionStatus("Connecting to server...");

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        {
          email: email.trim(),
          password: password.trim(),
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Connection-Source": "Mobile-App",
          },
          timeout: CONNECTION_TIMEOUT,
        }
      );

      const { user, token } = response.data;

      // Save in AsyncStorage
      await AsyncStorage.multiSet([
        ["auth", token],
        ["user", JSON.stringify(user)],
      ]);

      // Update Auth Context
      setUser(user);
      setToken(token);
      setIsSubscribed(user.isSubscribed);
      setSubscriptionExpiresAt(user.subscriptionExpiresAt);

      setConnectionStatus("Login successful");
      router.replace("/(authenticate)/select");
    } catch (error) {
      handleLoginError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginError = (error) => {
    let errorMessage = "An error occurred during login.";

    if (error.response) {
      if (error.response.status === 401) {
        errorMessage = "Invalid email or password.";
      } else if (error.response.status >= 500) {
        errorMessage = "Server error. Please try again later.";
      }
      setConnectionStatus(`Server error: ${error.response.status}`);
    } else if (error.code === "ECONNABORTED") {
      errorMessage =
        "Connection timeout. Please check your internet connection.";
      setConnectionStatus("Connection timeout");
    } else {
      errorMessage = error.message || "Network error occurred.";
      setConnectionStatus("Network error");
    }

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
        <Text style={styles.appTitle}>Match Mate</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          {connectionStatus ? (
            <View style={styles.connectionStatus}>
              <Text style={styles.connectionStatusText}>
                {connectionStatus}
              </Text>
            </View>
          ) : null}

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

            <View style={styles.passwordContainer}>
              <AntDesign
                style={styles.icon}
                name="lock1"
                size={24}
                color="white"
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Enter your password"
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
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={24}
                  color="white"
                />
              </TouchableOpacity>
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

            <Pressable
              onPress={() => router.replace("/register")}
              style={styles.signUpContainer}
            >
              <Text style={styles.signUpText}>
                Don't have an account?{" "}
                <Text style={styles.signUpLink}>Sign Up</Text>
              </Text>
            </Pressable>

            <View style={styles.debugContainer}>
              <Text style={styles.debugText}>Connected to: {API_BASE_URL}</Text>
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
    flex: 1,
    width: "100%",
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  connectionStatus: {
    backgroundColor: "#e3f2fd",
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  connectionStatusText: {
    color: "#1976d2",
    textAlign: "center",
    fontSize: 12,
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
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFC0CB",
    paddingVertical: 5,
    borderRadius: 5,
    marginTop: 20,
    position: "relative",
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
  passwordInput: {
    color: "white",
    marginVertical: 10,
    width: "75%",
    fontSize: 17,
    paddingRight: 40,
  },
  eyeIcon: {
    position: "absolute",
    right: 10,
    padding: 10,
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
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
  },
  debugText: {
    fontSize: 12,
    color: "#666",
  },
});

export default Login;

