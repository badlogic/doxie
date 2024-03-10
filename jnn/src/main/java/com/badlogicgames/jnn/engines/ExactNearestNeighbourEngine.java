package com.badlogicgames.jnn.engines;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.PriorityQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;

import com.badlogicgames.jnn.Linalg;

public class ExactNearestNeighbourEngine implements NearestNeighbourEngine {
    int numDimensions;
    int cpus;
    float[] vectors;
    EngineSimilarity[] similarities;
    ExecutorService executor;
    TopKSelection selection;
    public long numQueries = 0;
    public long selectionTimes = 0;
    public long dotTimes = 0;

    public ExactNearestNeighbourEngine(int numDimensions, int cpus) {
        this(numDimensions, cpus, TopKSelection.HEAP_SELECTION);
    }

    public ExactNearestNeighbourEngine(int numDimensions, int cpus, TopKSelection selection) {
        this.numDimensions = numDimensions;
        this.cpus = cpus;
        this.selection = selection;
        vectors = new float[0];
        similarities = new EngineSimilarity[0];
        this.executor = Executors.newFixedThreadPool(cpus, new ThreadFactory() {
            public Thread newThread(Runnable r) {
                Thread t = Executors.defaultThreadFactory().newThread(r);
                t.setDaemon(true);
                return t;
            }
        });
    }

    @Override
    public void addVectors(float[][] inputVectors) {
        float[] newVectors = new float[vectors.length + inputVectors.length * numDimensions];
        System.arraycopy(vectors, 0, newVectors, 0, vectors.length);
        int offset = vectors.length;
        for (float[] vector : inputVectors) {
            System.arraycopy(vector, 0, newVectors, offset, numDimensions);
            offset += numDimensions;
        }
        vectors = newVectors;

        var newSimilarities = new EngineSimilarity[numVectors() + inputVectors.length];
        System.arraycopy(similarities, 0, newSimilarities, 0, similarities.length);
        for (int i = similarities.length; i < newSimilarities.length; i++) {
            newSimilarities[i] = new EngineSimilarity();
        }
        similarities = newSimilarities;
    }

    @Override
    public EngineSimilarity[] query(float[] query, int k) {
        int totalVectors = numVectors();
        int chunkSize = (int) Math.ceil(totalVectors / (double) cpus);
        List<Future<?>> futures = new ArrayList<>();

        for (int i = 0; i < similarities.length; i++) {
            var similarity = similarities[i];
            similarity.index = i;
        }

        long dotTime = System.nanoTime();
        for (int i = 0; i < cpus; i++) {
            final int start = i * chunkSize;
            final int end = Math.min(start + chunkSize, totalVectors);
            futures.add(executor.submit((Runnable) () -> {
                for (int j = start, offset = start * numDimensions; j < end; j++, offset += numDimensions) {
                    var similarity = similarities[j];
                    similarity.similarity = Linalg.dot(vectors, offset, query);
                }
            }));
        }

        for (Future<?> future : futures) {
            try {
                future.get();
            } catch (InterruptedException | ExecutionException e) {
                throw new RuntimeException(e);
            }
        }
        this.dotTimes += (System.nanoTime() - dotTime);

        long selectionTime = System.nanoTime();
        var topK = this.selection.select(this.similarities, k);
        this.selectionTimes += (System.nanoTime() - selectionTime);
        this.numQueries++;
        return topK;
    }

    @Override
    public int numVectors() {
        return vectors.length / numDimensions;
    }

    @FunctionalInterface
    public static interface TopKSelection {
        EngineSimilarity[] select(EngineSimilarity[] similarities, int k);

        public static final TopKSelection HEAP_SELECTION = (similarities, k) -> {
            var heap = new PriorityQueue<EngineSimilarity>(k, (o1, o2) -> Float.compare(o1.similarity, o2.similarity));
            for (var item : similarities) {
                if (heap.size() < k) {
                    heap.offer(item);
                } else if (heap.peek().similarity < item.similarity) {
                    heap.poll();
                    heap.offer(item);
                }
            }

            var result = heap.toArray(new EngineSimilarity[Math.min(k, heap.size())]);
            Arrays.sort(result, (o1, o2) -> Float.compare(o2.similarity, o1.similarity));
            return result;
        };

        public static final TopKSelection SORT_SELECTION = (similarities, k) -> {
            Arrays.sort(similarities, (o1, o2) -> Float.compare(o2.similarity, o1.similarity));
            if (similarities.length <= k)
                return similarities;
            EngineSimilarity[] result = new EngineSimilarity[k];
            for (int i = 0; i < k; i++) {
                result[i] = similarities[i];
            }
            return result;
        };
    }
}