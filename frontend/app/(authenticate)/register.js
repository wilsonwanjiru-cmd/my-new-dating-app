import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  Image,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform
} from "react-native";
import React, { useState } from "react";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../../src/_api/client";
import { useAuth } from "../../src/_context/AuthContext";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [gender, setGender] = useState(null);
  const [birthDate, setBirthDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  // ✅ Normalize phone number to +254 format
  const normalizePhoneNumber = (number) => {
    let formatted = number.trim();

    // If starts with +254, keep as is
    if (formatted.startsWith("+254")) {
      return formatted;
    }
    // If starts with 07, convert to +2547xxxxxxx
    else if (formatted.startsWith("07")) {
      return "+254" + formatted.substring(1);
    }
    // If starts with 7 and length is 9, convert to +2547xxxxxxx
    else if (formatted.startsWith("7") && formatted.length === 9) {
      return "+254" + formatted;
    }
    return null; // Invalid format
  };

  const handleRegister = async () => {
    if (!name || !email || !password || !gender || !phoneNumber || !birthDate) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    // ✅ Email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    // ✅ Validate & normalize phone number
    const formattedPhone = normalizePhoneNumber(phoneNumber);
    if (!formattedPhone) {
      Alert.alert("Invalid Phone", "Enter a valid phone number starting with +254 or 07");
      return;
    }

    setIsLoading(true);
    const userData = {
      name,
      email,
      password,
      phoneNumber: formattedPhone,
      gender,
      birthDate,
      genderPreference: gender === "male" ? ["female"] : ["male"]
    };

    try {
      const response = await api.post("/api/auth/register", userData, {
        headers: { "Content-Type": "application/json" }
      });

      const { token, refreshToken, user } = response.data;

      await AsyncStorage.multiSet([
        ["authToken", token],
        ["refreshToken", refreshToken],
        ["userId", user._id],
        ["userData", JSON.stringify(user)],
        ["userGender", gender]
      ]);

      login({
        token,
        user,
        gender,
        isSubscribed: user.subscription?.isActive || false,
        subscriptionExpiresAt: user.subscription?.expiresAt || null
      });

      setTimeout(() => {
        router.replace("/(tabs)/bio");
      }, 300);
    } catch (error) {
      console.error(
        "Registration error:",
        error.response ? error.response.data : error.message
      );

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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 50 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                style={styles.logo}
                source={{
                  uri: "https://cdn-icons-png.flaticon.com/128/6655/6655045.png"
                }}
              />
            </View>
            <Text style={styles.appName}>Ruda Dating</Text>
          </View>

          <View style={styles.titleContainer}>
            <Text style={styles.title}>Create Your Ruda Account</Text>
          </View>

          <View style={styles.imageContainer}>
            <Image
              style={styles.registerImage}
              source={{
                uri: "https://cdn-icons-png.flaticon.com/128/2509/2509078.png"
              }}
            />
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            {/* Name */}
            <View style={styles.inputContainer}>
              <Ionicons style={styles.icon} name="person-sharp" size={24} color="white" />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Full Name"
                placeholderTextColor={"white"}
                style={styles.input}
                autoCapitalize="words"
              />
            </View>

            {/* Email */}
            <View style={styles.inputContainer}>
              <MaterialIcons style={styles.icon} name="email" size={24} color="white" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email Address"
                placeholderTextColor={"white"}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Password */}
            <View style={styles.inputContainer}>
              <AntDesign style={styles.icon} name="lock1" size={24} color="white" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Password"
                style={[styles.input, { flex: 1 }]}
                placeholderTextColor="white"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={22}
                  color="white"
                  style={{ marginRight: 10 }}
                />
              </Pressable>
            </View>

            {/* Phone */}
            <View style={styles.inputContainer}>
              <Ionicons style={styles.icon} name="call" size={24} color="white" />
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Phone Number (07... or +254...)"
                placeholderTextColor={"white"}
                style={styles.input}
                keyboardType="phone-pad"
              />
            </View>

            {/* Birth Date */}
            <View style={styles.inputContainer}>
              <Ionicons style={styles.icon} name="calendar" size={24} color="white" />
              <TextInput
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="Birth Date (YYYY-MM-DD)"
                placeholderTextColor={"white"}
                style={styles.input}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            {/* Gender */}
            <View style={styles.genderContainer}>
              <Text style={styles.genderLabel}>Select Your Gender:</Text>
              <View style={styles.genderButtons}>
                <Pressable
                  style={[styles.genderButton, gender === "male" && styles.genderSelected]}
                  onPress={() => setGender("male")}
                >
                  <Text style={styles.genderText}>Male</Text>
                </Pressable>
                <Pressable
                  style={[styles.genderButton, gender === "female" && styles.genderSelected]}
                  onPress={() => setGender("female")}
                >
                  <Text style={styles.genderText}>Female</Text>
                </Pressable>
              </View>
            </View>

            {/* Register Button */}
            <Pressable
              onPress={handleRegister}
              style={styles.registerButton}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.registerButtonText}>Create Account</Text>
              )}
            </Pressable>

            {/* Login Link */}
            <Pressable
              onPress={() => router.replace("/login")}
              style={styles.loginLink}
            >
              <Text style={styles.loginLinkText}>
                Already have an account? Sign In
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
  header: { height: 200, backgroundColor: "#FF69B4", width: "100%" },
  logoContainer: { justifyContent: "center", alignItems: "center", marginTop: 25 },
  logo: { width: 150, height: 80, resizeMode: "contain" },
  appName: { marginTop: 20, textAlign: "center", fontSize: 24, fontWeight: "bold", color: "white" },
  titleContainer: { alignItems: "center" },
  title: { fontSize: 20, fontWeight: "bold", marginTop: 25, color: "#FF1493" },
  imageContainer: { justifyContent: "center", alignItems: "center", marginTop: 20 },
  registerImage: { width: 100, height: 80, resizeMode: "cover" },
  formContainer: { marginTop: 20, paddingHorizontal: 20, paddingBottom: 50 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFB6C1",
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 15,
    borderWidth: 1,
    borderColor: "#FF69B4"
  },
  icon: { marginLeft: 8 },
  input: { color: "white", marginVertical: 10, width: "80%", fontSize: 16, fontWeight: "500" },
  genderContainer: { marginTop: 20, marginBottom: 10 },
  genderLabel: { fontSize: 16, marginBottom: 10, color: "#FF1493", fontWeight: "500" },
  genderButtons: { flexDirection: "row", justifyContent: "space-between" },
  genderButton: {
    flex: 1,
    padding: 15,
    backgroundColor: "#FFB6C1",
    borderRadius: 10,
    marginHorizontal: 5,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FF69B4"
  },
  genderSelected: { backgroundColor: "#FF69B4", borderColor: "#FF1493" },
  genderText: { color: "white", fontWeight: "bold" },
  registerButton: {
    width: "100%",
    backgroundColor: "#FF1493",
    borderRadius: 10,
    padding: 15,
    marginTop: 20,
    alignItems: "center",
    elevation: 3
  },
  registerButtonText: { color: "white", fontSize: 18, fontWeight: "bold" },
  loginLink: { marginTop: 40 },
  loginLinkText: { textAlign: "center", color: "#FF69B4", fontSize: 16, fontWeight: "500" }
});

export default Register;
