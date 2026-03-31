import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { apiPost } from '../../api/client';
import { GradientButton } from '../../components/GradientButton';
import { ThemedText } from '../../components/Themed';
import { useAuth } from '../../providers/AuthProvider';
import { colors, radius } from '../../theme';
import { AuthStackParamList } from '../../navigation/types';

interface LivenessChallenge {
  type: string;
  durationMs: number;
}

interface LivenessStartResponse {
  sessionId: string;
  challenges: LivenessChallenge[];
  expiresAt: string;
}

interface LivenessSubmitResponse {
  passed: boolean;
  confidence: number;
}

export const OnboardingLivenessScreen: React.FC = () => {
  const { login } = useAuth();
  const route = useRoute<RouteProp<AuthStackParamList, 'OnboardingLiveness'>>();
  const params = route.params;
  const hasContext = Boolean(params.tokens?.accessToken && params.tokens?.refreshToken);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<LivenessChallenge[]>([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [frames, setFrames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LivenessSubmitResponse | null>(null);

  useEffect(() => {
    const start = async () => {
      if (!hasContext) {
        setError('Onboarding session missing. Restart onboarding.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const payload = await apiPost<LivenessStartResponse>(
          '/kyc/liveness/start',
          { sessionType: 'KYC_UPGRADE' },
          params.tokens.accessToken
        );
        setSessionId(payload.sessionId);
        setChallenges(payload.challenges ?? []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void start();
  }, [hasContext, params.tokens.accessToken]);

  const requiredFrames = Math.max(challenges.length, 1);
  const currentChallenge = challenges[challengeIndex]?.type?.replace(/_/g, ' ') || 'LOOK STRAIGHT';
  const capturedAll = frames.length >= requiredFrames;

  const captureStep = async () => {
    if (!cameraRef.current) return;
    if (capturedAll) return;
    try {
      setCapturing(true);
      setError(null);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.4,
        base64: true,
        skipProcessing: true
      });
      if (!photo.base64) {
        setError('Could not capture liveness frame. Try again.');
        return;
      }
      setFrames((prev) => [...prev, photo.base64 as string]);
      setChallengeIndex((prev) => Math.min(prev + 1, requiredFrames - 1));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCapturing(false);
    }
  };

  const submit = async () => {
    if (!sessionId || !hasContext || frames.length === 0) return;
    try {
      setSubmitting(true);
      setError(null);
      const payload = await apiPost<LivenessSubmitResponse>(
        '/kyc/liveness/submit',
        {
          sessionId,
          frames,
          deviceSensors: {
            platform: Platform.OS,
            capturedAt: new Date().toISOString(),
            frameCount: frames.length
          }
        },
        params.tokens.accessToken
      );
      setResult(payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const completeOnboarding = async () => {
    if (!hasContext) return;
    await login(params.tokens);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.accent} />
        <ThemedText style={styles.loadingText}>Preparing liveness check...</ThemedText>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.accent} />
        <ThemedText style={styles.loadingText}>Loading camera permission...</ThemedText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.title}>Camera Permission Needed</ThemedText>
        <ThemedText style={styles.subtitle}>
          Liveness verification requires camera access to capture challenge frames.
        </ThemedText>
        <GradientButton title="Grant Camera Access" onPress={() => void requestPermission()} style={styles.cta} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>Liveness Verification</ThemedText>
      <ThemedText style={styles.subtitle}>
        Step {Math.min(challengeIndex + 1, requiredFrames)} of {requiredFrames}: {currentChallenge}
      </ThemedText>

      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front" />
      </View>

      <View style={styles.challengeCard}>
        <ThemedText style={styles.challengeTitle}>Captured frames: {frames.length}/{requiredFrames}</ThemedText>
        <ThemedText style={styles.challengeText}>
          Capture one frame per challenge. Keep your face centered and well lit.
        </ThemedText>
      </View>

      {result ? (
        <View style={styles.resultCard}>
          <ThemedText style={styles.resultTitle}>
            {result.passed ? 'Verification Passed' : 'Verification Failed'}
          </ThemedText>
          <ThemedText style={styles.resultSub}>
            Confidence: {(result.confidence * 100).toFixed(0)}%
          </ThemedText>
        </View>
      ) : null}

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {capturing || submitting ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} />
      ) : result?.passed ? (
        <GradientButton
          title="Finish & Enter App"
          onPress={completeOnboarding}
          style={styles.cta}
          disabled={!hasContext}
        />
      ) : (
        <>
          <Pressable
            style={({ pressed }) => [styles.captureBtn, pressed && styles.captureBtnPressed]}
            onPress={() => void captureStep()}
            disabled={capturedAll}
          >
            <ThemedText style={styles.captureBtnText}>
              {capturedAll ? 'All frames captured' : 'Capture Frame'}
            </ThemedText>
          </Pressable>
          <GradientButton title="Submit Liveness" onPress={() => void submit()} style={styles.cta} disabled={!capturedAll} />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 40,
    backgroundColor: colors.bg,
    gap: 12
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    gap: 12
  },
  loadingText: {
    color: colors.textSecondary
  },
  title: {
    fontSize: 28,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textSecondary
  },
  cameraWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#000'
  },
  camera: {
    flex: 1
  },
  challengeCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14
  },
  challengeTitle: {
    fontWeight: '700',
    marginBottom: 6
  },
  challengeText: {
    color: colors.textSecondary,
    lineHeight: 20
  },
  resultCard: {
    borderWidth: 1,
    borderColor: 'rgba(79,224,193,0.45)',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(79,224,193,0.1)',
    padding: 14
  },
  resultTitle: {
    fontWeight: '700',
    fontSize: 16
  },
  resultSub: {
    color: colors.textSecondary,
    marginTop: 4
  },
  captureBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(79,224,193,0.12)'
  },
  captureBtnPressed: {
    opacity: 0.7
  },
  captureBtnText: {
    fontWeight: '700',
    color: colors.accent
  },
  error: {
    color: '#ff8f8f'
  },
  cta: {
    marginBottom: 8
  }
});
