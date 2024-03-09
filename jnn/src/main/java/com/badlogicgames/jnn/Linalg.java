package com.badlogicgames.gann;

public class Linalg {
    public static void norm(float[] v) {
        float sum = 0;
        for (int i = 0; i < v.length; i++) {
            sum += v[i] * v[i];
        }
        if (sum == 0)
            return;
        float length = (float) Math.sqrt(sum);

        for (int i = 0; i < v.length; i++) {
            v[i] /= length;
        }
    }

    public static float dot(float[] a, float[] b) {
        if (a.length != b.length) {
            throw new RuntimeException("Vector lengths not equal");
        }
        float dot = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
        }
        return dot;
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
