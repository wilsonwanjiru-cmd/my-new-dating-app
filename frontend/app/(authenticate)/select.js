import { 
  StyleSheet, 
  Text, 
  View, 
  Pressable, 
  Image, 
  Alert,
  ActivityIndicator
} from "react-native";
import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useAuth } from '../../src/_context/AuthContext'; // Fixed import path
import api from "../../src/_api/client"; // Fixed import path

const Select = () => {
  const router = useRouter();
  const [gender, setGender] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user, updateUser } = useAuth();

  // Gender options with corresponding icons
  const genderOptions = [
    {
      id: "male",
      label: "I am a Man",
      icon: "https://cdn-icons-png.flaticon.com/128/4140/4140048.png",
      description: "You'll see women in your feed"
    },
    {
      id: "female",
      label: "I am a Woman",
      icon: "https://cdn-icons-png.flaticon.com/128/4140/4140047.png",
      description: "You'll see men in your feed"
    }
  ];

  useEffect(() => {
    // Redirect if user already has gender set
    if (user?.gender) {
      router.replace("/(tabs)/bio");
    }
  }, [user]);

  const updateUserGender = async () => {
    if (!gender) {
      Alert.alert("Error", "Please select your gender");
      return;
    }

    setIsLoading(true);
    
    try {
      // Update gender on backend using the correct endpoint
      const response = await api.post(
        "/api/auth/select-gender",
        { gender }
      );

      // Update user in context and local storage
      if (updateUser) {
        await updateUser({ 
          gender: response.data.gender,
          genderPreference: response.data.genderPreference,
          profileComplete: response.data.profileComplete
        });
        
        // Store updated data in AsyncStorage
        await AsyncStorage.multiSet([
          ['userGender', response.data.gender],
          ['profileComplete', JSON.stringify(response.data.profileComplete)]
        ]);
      }

      // Navigate directly to bio screen
      router.replace("/(tabs)/bio");
      
    } catch (error) {
      console.log("Error updating gender:", error);
      Alert.alert(
        "Error", 
        error.response?.data?.message || "Failed to update gender. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image
        style={styles.logo}
        source={{ uri: "https://cdn-icons-png.flaticon.com/128/6655/6655045.png" }}
      />
      
      <Text style={styles.title}>Select Your Gender</Text>
      <Text style={styles.subtitle}>
        This helps us match you with compatible partners. Your choice determines who you'll see in your feed.
      </Text>

      <View style={styles.optionsContainer}>
        {genderOptions.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => setGender(option.id)}
            style={[
              styles.optionCard,
              gender === option.id && styles.selectedCard
            ]}
          >
            <View style={styles.optionContent}>
              <Image
                style={styles.optionIcon}
                source={{ uri: option.icon }}
              />
              <View style={styles.textContainer}>
                <Text style={styles.optionText}>{option.label}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
            </View>
            
            {gender === option.id && (
              <View style={styles.selectedIndicator}>
                <View style={styles.selectedDot} />
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={updateUserGender}
        style={[styles.continueButton, !gender && styles.disabledButton]}
        disabled={!gender || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.continueText}>Continue to Feed</Text>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    padding: 25,
    justifyContent: "center",
  },
  logo: {
    width: 120,
    height: 100,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    color: "#FF1493",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 40,
    textAlign: "center",
    lineHeight: 22,
  },
  optionsContainer: {
    marginBottom: 30,
  },
  optionCard: {
    backgroundColor: "#FFF5F7",
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FFD1DC",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedCard: {
    borderColor: "#FF69B4",
    backgroundColor: "#FFF0F5",
    borderWidth: 2,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionIcon: {
    width: 60,
    height: 60,
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  optionText: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 5,
    color: "#444",
  },
  optionDescription: {
    fontSize: 14,
    color: "#777",
  },
  selectedIndicator: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FF1493",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  selectedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "white",
  },
  continueButton: {
    backgroundColor: "#FF1493",
    padding: 18,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF1493",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  disabledButton: {
    opacity: 0.6,
  },
  continueText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
});

export default Select;