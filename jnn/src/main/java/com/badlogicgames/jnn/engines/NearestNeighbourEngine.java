package com.badlogicgames.jnn.engines;

public interface NearestNeighbourEngine {
    void addVectors(float[][] vector);

    EngineSimilarity[] query(float[] query, int k);

    int numVectors();

    public static class EngineSimilarity {
        public int index;
        public float similarity;

        @Override
        public boolean equals(Object o) {
            if (this == o)
                return true;
            if (o == null || getClass() != o.getClass())
                return false;

            EngineSimilarity that = (EngineSimilarity) o;

            if (index != that.index)
                return false;
            return Float.compare(that.similarity, similarity) == 0;
        }

        @Override
        public int hashCode() {
            int result = index;
            result = 31 * result + (similarity != +0.0f ? Float.floatToIntBits(similarity) : 0);
            return result;
        }
    }
}