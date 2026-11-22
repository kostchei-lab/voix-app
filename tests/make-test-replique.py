# Fabrique une « réplique » de test : trois morceaux voisés séparés par des silences de 0,5 s et 0,8 s,
# le dernier en voix descendante (150 → 110 Hz). Usage : python3 tests/make-test-replique.py <sortie.wav>
import sys, wave
import numpy as np

SR = 48000
def vowel(f0):
    phase = np.cumsum(2 * np.pi * f0 / SR)
    s = np.zeros_like(phase)
    for h in range(1, int(6000 // f0.max())):
        g = 1.0 / h
        for fc, bw in [(700, 110), (1200, 120), (2600, 160)]:
            g = g * (1 + 4 / (1 + ((h * f0 - fc) / bw) ** 2))
        s += g * np.sin(h * phase)
    n = len(s); env = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (0.02 * SR))
    return 0.3 * env * s / np.abs(s).max()
def voiced(sec, f_a, f_b):
    return vowel(np.linspace(f_a, f_b, int(sec * SR)) * (1 + 0.01 * np.sin(np.arange(int(sec * SR)) / SR * 2 * np.pi * 5)))
sil = lambda sec: np.zeros(int(sec * SR))
x = np.concatenate([sil(0.6), voiced(1.2, 130, 140), sil(0.5), voiced(1.0, 140, 135), sil(0.8), voiced(1.2, 150, 110), sil(1.4)])
x = x + 0.0005 * np.random.default_rng(1).standard_normal(len(x))
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
