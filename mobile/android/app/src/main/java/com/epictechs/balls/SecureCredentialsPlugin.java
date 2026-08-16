package com.epictechs.balls;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureCredentials")
public class SecureCredentialsPlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";

    // API server key (shared by the Termux and embedded runtimes).
    private static final String KEY_ALIAS = "BallsApiKey";
    private static final String PREFS = "secure_credentials";
    private static final String CIPHERTEXT = "api_key_ciphertext";
    private static final String IV = "api_key_iv";

    // Provider configuration for the embedded runtime (Keystore-encrypted JSON).
    // Stored under its own prefs file so clearApiKey() never wipes it.
    private static final String PROVIDER_ALIAS = "BallsProviderConfig";
    private static final String PROVIDER_PREFS = "provider_config";
    private static final String PROVIDER_CIPHERTEXT = "provider_config_ciphertext";
    private static final String PROVIDER_IV = "provider_config_iv";

    // Per-device provisioning ID (Epic Cloud account). High-entropy random,
    // Keystore-encrypted, created once and never re-generated.
    private static final String DEVICE_ALIAS = "BallsDeviceId";
    private static final String DEVICE_PREFS = "secure_device_id";
    private static final String DEVICE_CIPHERTEXT = "ciphertext";
    private static final String DEVICE_IV = "iv";

    // Embedded runtime's own API key: generated on first use, independent of
    // the Termux pairing key. Own prefs + own alias so it survives
    // clearApiKey() (forget-pairing) and is never shown in the pairing UI.
    private static final String EMBEDDED_ALIAS = "BallsEmbeddedKey";
    private static final String EMBEDDED_PREFS = "embedded_key";
    private static final String EMBEDDED_CIPHERTEXT = "embedded_key_ciphertext";
    private static final String EMBEDDED_IV = "embedded_key_iv";

    private static final int GCM_TAG_BITS = 128;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    /** Embedded runtime API key: generated once and stored, or the existing value. */
    public static String ensureEmbeddedApiKey(Context context) {
        String existing = readSecret(context, EMBEDDED_PREFS, EMBEDDED_CIPHERTEXT, EMBEDDED_IV, EMBEDDED_ALIAS);
        if (existing != null && !existing.isEmpty()) {
            return existing;
        }
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        StringBuilder hex = new StringBuilder(64);
        for (byte b : bytes) {
            hex.append(String.format("%02x", b));
        }
        String generated = hex.toString();
        try {
            writeSecret(context, EMBEDDED_PREFS, EMBEDDED_CIPHERTEXT, EMBEDDED_IV, EMBEDDED_ALIAS, generated);
        } catch (Exception error) {
            // Never leave the embedded runtime keyed to an unpersisted value:
            // fall back to null so callers fail closed.
            return null;
        }
        return generated;
    }

    @PluginMethod
    public void getApiKey(PluginCall call) {
        try {
            JSObject result = new JSObject();
            String apiKey = readApiKey(getContext());
            if (apiKey != null) {
                result.put("apiKey", apiKey);
            }
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read the stored API key");
        }
    }

    @PluginMethod
    public void setApiKey(PluginCall call) {
        String apiKey = call.getString("apiKey");
        if (apiKey == null || apiKey.trim().isEmpty()) {
            call.reject("An API server key is required");
            return;
        }

        try {
            writeSecret(getContext(), PREFS, CIPHERTEXT, IV, KEY_ALIAS, apiKey.trim());
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to store the API key securely");
        }
    }

    @PluginMethod
    public void clearApiKey(PluginCall call) {
        try {
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) {
                keyStore.deleteEntry(KEY_ALIAS);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to clear the stored API key");
        }
    }

    /** Stored API key, or null when absent. Used by ManagedRuntimePlugin. */
    public static String readApiKey(Context context) {
        return readSecret(context, PREFS, CIPHERTEXT, IV, KEY_ALIAS);
    }

    /** Stored provider-config JSON, or null when absent. */
    public static String readProviderConfig(Context context) {
        return readSecret(context, PROVIDER_PREFS, PROVIDER_CIPHERTEXT, PROVIDER_IV, PROVIDER_ALIAS);
    }

    /** Encrypt and store the provider-config JSON. */
    public static void writeProviderConfig(Context context, String providerJson) throws Exception {
        writeSecret(context, PROVIDER_PREFS, PROVIDER_CIPHERTEXT, PROVIDER_IV, PROVIDER_ALIAS, providerJson);
    }

    /**
     * Per-device provisioning ID: generated once (32 hex chars, SecureRandom),
     * Keystore-encrypted, never re-generated. Used for Epic Cloud accounts.
     */
    public static String getOrCreateDeviceId(Context context) throws Exception {
        String existing = readSecret(context, DEVICE_PREFS, DEVICE_CIPHERTEXT, DEVICE_IV, DEVICE_ALIAS);
        if (existing != null && !existing.isEmpty()) {
            return existing;
        }
        byte[] bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        StringBuilder hex = new StringBuilder(32);
        for (byte b : bytes) {
            hex.append(String.format("%02x", b));
        }
        String deviceId = hex.toString();
        writeSecret(context, DEVICE_PREFS, DEVICE_CIPHERTEXT, DEVICE_IV, DEVICE_ALIAS, deviceId);
        return deviceId;
    }

    private static String readSecret(Context context, String prefsName, String cipherKey, String ivKey, String alias) {
        try {
            SharedPreferences preferences = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE);
            String encodedCiphertext = preferences.getString(cipherKey, null);
            String encodedIv = preferences.getString(ivKey, null);
            if (encodedCiphertext == null || encodedIv == null) {
                return null;
            }
            return decrypt(alias, encodedCiphertext, encodedIv);
        } catch (Exception error) {
            return null;
        }
    }

    private static void writeSecret(Context context, String prefsName, String cipherKey, String ivKey, String alias, String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getSecretKey(alias));
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).edit()
                .putString(cipherKey, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(ivKey, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();
    }

    private static String decrypt(String alias, String encodedCiphertext, String encodedIv) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] iv = Base64.decode(encodedIv, Base64.NO_WRAP);
        cipher.init(Cipher.DECRYPT_MODE, getSecretKey(alias), new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] plaintext = cipher.doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP));
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    private static SecretKey getSecretKey(String alias) throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(alias)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(alias, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }
}
