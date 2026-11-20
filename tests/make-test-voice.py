# Fabrique une « voix » de test : silence, 110 Hz, 220 Hz, glissade 150 → 250 Hz, silence.
import sys, wave
import numpy as np

SR = 48000
def vowel(f0_curve):
    phase = np.cumsum(2 * np.pi * f0_curve / SR)
    s = np.zeros_like(phase)
    fmax = f0_curve.max()
    for h in range(1, int(7000 // fmax)):
        fh = h * f0_curve
        g = 1.0 / h
        for fc, bw in [(700, 110), (1200, 120), (2600, 160)]:
            g = g * (1 + 4 / (1 + ((fh - fc) / bw) ** 2))
        s += g * np.sin(h * phase)
    s /= np.abs(s).max()
    return 0.3 * s

def seg(sec, f0=None, f1=None):
    n = int(sec * SR)
    if f0 is None:
        return np.zeros(n)
    curve = np.linspace(f0, f1 if f1 else f0, n)
    return vowel(curve)

sig = np.concatenate([seg(1.0), seg(2.0, 110), seg(0.3), seg(2.0, 220), seg(0.3), seg(2.0, 150, 250), seg(1.0)])
sig += np.random.default_rng(1).normal(0, 0.001, sig.size)
pcm = (np.clip(sig, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', sig.size / SR, 's')
