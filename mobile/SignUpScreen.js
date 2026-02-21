import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { handleSignup } from './utils/auth';

const SignUpScreen = ({ onNavigateToLogin }) => {
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [sex, setSex] = useState('Male');
  const [age, setAge] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const onSignUp = async () => {
    // Immediate test to verify button works
    console.log('Sign Up button clicked!');
    Alert.alert('Debug', 'Button clicked! Processing...');
    
    try {
      // Validate all fields
      if (!firstName || !lastName || !email || !password || !confirmPassword) {
        console.log('Validation failed: missing fields');
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }

      if (password !== confirmPassword) {
        console.log('Validation failed: passwords do not match');
        Alert.alert('Error', 'Passwords do not match');
        return;
      }

      console.log('Starting signup process...');
      setLoading(true);
      
      // Pass user data to signup function
      const userData = {
        firstName,
        middleName,
        lastName,
        sex,
        age,
        address
      };
      
      console.log('Calling handleSignup with:', { email, userData });
      const result = await handleSignup(email, password, userData);
      console.log('Signup successful:', result);
      
      Alert.alert('Success', 'Account created successfully!', [
        { text: 'OK', onPress: onNavigateToLogin }
      ]);
    } catch (error) {
      console.error('Signup error:', error);
      Alert.alert('Error', error.message || 'An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>WELCOME</Text>
        </View>

        {/* Logo/Branding */}
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>β</Text>
            </View>
          </View>
          <Text style={styles.brandText}>Threat Track</Text>
        </View>

        {/* Form Container */}
        <View style={styles.formContainer}>
          <Text style={styles.title}>Create your Account</Text>

          {/* First Name and Middle Name */}
          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <TextInput
                style={styles.input}
                placeholder="First Name:"
                placeholderTextColor="#999"
                value={firstName}
                onChangeText={setFirstName}
                editable={!loading}
              />
            </View>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <TextInput
                style={styles.input}
                placeholder="Middle Name:"
                placeholderTextColor="#999"
                value={middleName}
                onChangeText={setMiddleName}
                editable={!loading}
              />
            </View>
          </View>

          {/* Last Name */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Last Name:"
              placeholderTextColor="#999"
              value={lastName}
              onChangeText={setLastName}
              editable={!loading}
            />
          </View>

          {/* Sex and Age */}
          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <View style={styles.pickerContainer}>
                <Text style={styles.pickerLabel}>Sex:</Text>
                <Picker
                  selectedValue={sex}
                  onValueChange={(value) => setSex(value)}
                  style={styles.picker}
                  enabled={!loading}
                >
                  <Picker.Item label="Male" value="Male" />
                  <Picker.Item label="Female" value="Female" />
                </Picker>
              </View>
            </View>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <TextInput
                style={styles.input}
                placeholder="Age:"
                placeholderTextColor="#999"
                value={age}
                onChangeText={setAge}
                keyboardType="numeric"
                editable={!loading}
              />
            </View>
          </View>

          {/* Complete Address */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Complete Address:"
              placeholderTextColor="#999"
              value={address}
              onChangeText={setAddress}
              editable={!loading}
            />
          </View>

          {/* Complete Email */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Complete Email:"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          {/* Password */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Password:"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity 
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.eyeText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
            </TouchableOpacity>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Confirm Password:"
              placeholderTextColor="#999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity 
              style={styles.eyeIcon}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Text style={styles.eyeText}>{showConfirmPassword ? '👁️' : '👁️‍🗨️'}</Text>
            </TouchableOpacity>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity 
            style={[styles.signupButton, loading && styles.signupButtonDisabled]} 
            onPress={onSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.signupButtonText}>SIGN UP</Text>
            )}
          </TouchableOpacity>

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={onNavigateToLogin}>
              <Text style={styles.loginLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: '#1e3a8a',
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 30,
  },
  headerText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 2,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logo: {
    marginBottom: 10,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#1e3a8a',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logoText: {
    fontSize: 60,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  brandText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e3a8a',
  },
  formContainer: {
    paddingHorizontal: 30,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 25,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  halfWidth: {
    width: '48%',
  },
  input: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 25,
    fontSize: 16,
    color: '#333',
  },
  pickerContainer: {
    backgroundColor: '#e5e7eb',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerLabel: {
    fontSize: 16,
    color: '#999',
    marginRight: 5,
  },
  picker: {
    flex: 1,
    height: 40,
  },
  eyeIcon: {
    position: 'absolute',
    right: 20,
    top: 15,
  },
  eyeText: {
    fontSize: 20,
  },
  signupButton: {
    backgroundColor: '#1e3a8a',
    paddingVertical: 16,
    borderRadius: 25,
    marginBottom: 20,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  signupButtonDisabled: {
    backgroundColor: '#999',
  },
  signupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    paddingBottom: 30,
  },
  loginText: {
    color: '#666',
    fontSize: 14,
  },
  loginLink: {
    color: '#1e3a8a',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default SignUpScreen;
