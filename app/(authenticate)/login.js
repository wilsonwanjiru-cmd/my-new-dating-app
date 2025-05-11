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
  const [email, setEmail] = useState("wilsonmuita41@gmail.com");
  const [password, setPassword] = useState("WilsonWanjiru@2021");
  const [loading, setLoading] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState("");
  const [currentBaseURL, setCurrentBaseURL] = useState(api.defaults.baseURL);
  const router = useRouter();

  // Set your local IP address here
  const LOCAL_IP = "192.168.249.233";
  const LOCAL_BACKEND_URL = `http://${LOCAL_IP}:5000`;
  const PRODUCTION_BACKEND_URL = "https://dating-apps.onrender.com";

  useEffect(() => {
    const initializeConnection = async () => {
      // Try to use last working URL from storage
      const lastUsedUrl = await AsyncStorage.getItem("last_used_api_url");
      if (lastUsedUrl) {
        api.defaults.baseURL = lastUsedUrl;
        setCurrentBaseURL(lastUsedUrl);
      }
    };

    initializeConnection();

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

  const testConnection = async (url, timeout = 8000) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(`${url}/api/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return {
          success: true,
          url,
          status: response.status
        };
      }
      return {
        success: false,
        url,
        status: response.status
      };
    } catch (error) {
      console.warn(`Connection test failed for ${url}:`, error.message);
      return {
        success: false,
        url,
        error: error.message
      };
    }
  };

  const handleConnectionFailure = async () => {
    // Try fallback to local development server
    const localTest = await testConnection(LOCAL_BACKEND_URL, 5000);
    if (localTest.success) {
      setConnectionDetails(`Connected to local server: ${LOCAL_IP}`);
      api.defaults.baseURL = LOCAL_BACKEND_URL;
      setCurrentBaseURL(LOCAL_BACKEND_URL);
      await AsyncStorage.setItem("last_used_api_url", LOCAL_BACKEND_URL);
      return true;
    }
    
    // Try fallback to production again in case local failed
    const productionTest = await testConnection(PRODUCTION_BACKEND_URL, 10000);
    if (productionTest.success) {
      setConnectionDetails(`Reconnected to production server`);
      api.defaults.baseURL = PRODUCTION_BACKEND_URL;
      setCurrentBaseURL(PRODUCTION_BACKEND_URL);
      await AsyncStorage.setItem("last_used_api_url", PRODUCTION_BACKEND_URL);
      return true;
    }
    
    setConnectionDetails("All connection attempts failed");
    return false;
  };

  const handleLoginError = (error) => {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      name: error.name,
      message: error.message,
      code: error.code,
      currentBaseURL,
      connectionDetails,
      attemptedURLs: [
        `${currentBaseURL}/api/health`,
        `${LOCAL_BACKEND_URL}/api/health`
      ]
    };

    console.error("Connection error details:", JSON.stringify(errorDetails, null, 2));

    let errorTitle = "Connection Issue";
    let errorMessage = "";
    let actions = [];

    if (error.message.includes("NO_INTERNET")) {
      errorMessage = "No internet connection detected. Please check your network settings.";
      actions = [{ text: "OK" }];
    } 
    else if (error.message.includes("BACKEND_UNREACHABLE")) {
      errorMessage = `Cannot connect to our servers.\n\nTried:\n• ${currentBaseURL}\n• Local development server`;
      actions = [
        { text: "Try Local Server", onPress: () => {
          api.defaults.baseURL = LOCAL_BACKEND_URL;
          setCurrentBaseURL(LOCAL_BACKEND_URL);
          handleLogin();
        }},
        { text: "Retry", onPress: handleLogin }
      ];
    }
    else if (error.response) {
      errorTitle = "Server Error";
      errorMessage = error.response.data?.message || `Server responded with status ${error.response.status}`;
      actions = [{ text: "OK" }];
    }
    else {
      errorMessage = "An unexpected error occurred. Please try again.";
      actions = [{ text: "Retry", onPress: handleLogin }];
    }

    Alert.alert(errorTitle, errorMessage, actions);
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
      // 1. Check basic internet connectivity
      const internetTest = await testConnection('https://www.google.com', 5000);
      if (!internetTest.success) {
        throw new Error("NO_INTERNET: No internet connection");
      }

      // 2. Test current backend connection
      const backendTest = await testConnection(currentBaseURL);
      if (!backendTest.success) {
        setConnectionDetails(`Primary server unreachable (${backendTest.status || 'timeout'})`);
        
        // 3. Attempt fallback connection
        const fallbackConnected = await handleConnectionFailure();
        if (!fallbackConnected) {
          throw new Error("BACKEND_UNREACHABLE: All connection attempts failed");
        }
      } else {
        setConnectionDetails(`Connected to: ${currentBaseURL}`);
      }

      // Proceed with login
      const response = await api.post(
        "/api/auth/login",
        {
          email: email.trim(),
          password: password.trim(),
        },
        {
          headers: { 
            'Content-Type': 'application/json',
            'X-Connection-Source': 'Mobile-App',
            'X-Base-URL': currentBaseURL
          },
          timeout: 15000
        }
      );

      await AsyncStorage.multiSet([
        ["auth", response.data.token],
        ["user", JSON.stringify(response.data.user || {})],
        ["last_used_api_url", currentBaseURL]
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
            <Text style={styles.networkWarningText}>⚠️ Connection Issue</Text>
            <Text style={styles.connectionDetailsText}>
              {connectionDetails}
              {__DEV__ && `\nCurrent endpoint: ${currentBaseURL}`}
            </Text>
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
              <Text style={styles.debugText}>API Base: {currentBaseURL}</Text>
              <Text style={styles.debugText}>Connection: {connectionDetails}</Text>
              <Text style={styles.debugText}>Local IP: {LOCAL_IP}</Text>
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