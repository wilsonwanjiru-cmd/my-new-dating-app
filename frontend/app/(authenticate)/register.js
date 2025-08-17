import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  Image,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator
} from "react-native";
import React, { useState } from "react";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../../utils/service";
import { useAuth } from "../../_context/AuthContext";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setIsLoading(true);
    const user = {
      name: name,
      email: email,
      password: password,
    };

    try {
      const response = await api.post("/api/auth/register", user);
      
      // Automatically log the user in after registration
      const loginResponse = await api.post("/api/auth/login", {
        email: email,
        password: password
      });

      // Store the authentication data
      await AsyncStorage.multiSet([
        ['authToken', loginResponse.data.token],
        ['userId', loginResponse.data.user._id],
        ['userData', JSON.stringify(loginResponse.data.user)]
      ]);

      // Update auth context
      login({
        token: loginResponse.data.token,
        user: loginResponse.data.user
      });

      // Redirect directly to bio screen
      router.replace("/(tabs)/bio");
      
    } catch (error) {
      console.error("Registration error:", error.response ? error.response.data : error.message);
      
      let errorMessage = "An error occurred while registering. Please try again.";
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.status === 400) {
        errorMessage = "Invalid registration data";
      } else if (error.response?.status === 409) {
        errorMessage = "Email already exists";
      }

      Alert.alert("Registration Error", errorMessage);
    } finally {
      setIsLoading(false);
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
        <Text style={styles.appName}>Match Mate</Text>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.keyboardView}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Register to your Account</Text>
        </View>

        <View style={styles.imageContainer}>
          <Image
            style={styles.registerImage}
            source={{
              uri: "https://cdn-icons-png.flaticon.com/128/2509/2509078.png",
            }}
          />
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <Ionicons
              style={styles.icon}
              name="person-sharp"
              size={24}
              color="white"
            />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor={"white"}
              style={styles.input}
              autoCapitalize="words"
            />
          </View>

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
              placeholderTextColor={"white"}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
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
              placeholderTextColor="white"
            />
          </View>

          <Pressable
            onPress={handleRegister}
            style={styles.registerButton}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.registerButtonText}>Register</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.replace("/login")}
            style={styles.loginLink}
          >
            <Text style={styles.loginLinkText}>
              Already have an account? Sign In
            </Text>
          </Pressable>
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
  appName: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 20,
    fontFamily: "GillSans-SemiBold",
  },
  keyboardView: {
    width: "100%",
  },
  titleContainer: {
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "bold",
    marginTop: 25,
    color: "#F9629F",
  },
  imageContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  registerImage: {
    width: 100,
    height: 80,
    resizeMode: "cover",
  },
  formContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
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
    width: 300,
    fontSize: 17,
  },
  registerButton: {
    width: 200,
    backgroundColor: "#FFC0CB",
    borderRadius: 6,
    marginLeft: "auto",
    marginRight: "auto",
    padding: 15,
    marginTop: 50,
  },
  registerButtonText: {
    textAlign: "center",
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  loginLink: {
    marginTop: 12,
  },
  loginLinkText: {
    textAlign: "center",
    color: "gray",
    fontSize: 16,
  },
});

export default Register;