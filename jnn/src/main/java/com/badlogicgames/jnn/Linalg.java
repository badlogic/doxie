package com.badlogicgames.jnn;

public class Linalg {
    public static float norm(float[] v, int offset, int numDimensions) {
        float sum = 0;
        for (int i = 0; i < numDimensions; i++) {
            sum += v[offset + i] * v[offset + i];
        }
        if (sum == 0)
            return 0;
        float length = (float) Math.sqrt(sum);

        for (int i = 0; i < numDimensions; i++) {
            v[offset + i] /= length;
        }
        return length;
    }

    public static float dot(float[] a, int offset, float[] b) {
        if (offset < 0 || b.length > a.length - offset) {
            throw new RuntimeException("Invalid offset or vector length");
        }
        float dot = 0;
        for (int i = 0; i < b.length; i++) {
            dot += a[offset + i] * b[i];
        }
        return dot;
    }
}
