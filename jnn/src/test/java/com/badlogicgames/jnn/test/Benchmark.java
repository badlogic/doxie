package com.badlogicgames.jnn.test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.badlogicgames.jnn.VectorStore;
import com.badlogicgames.jnn.VectorStore.NearestNeighbourEngineProvider;
import com.badlogicgames.jnn.VectorStore.VectorDocument;
import com.badlogicgames.jnn.engines.ExactNearestNeighbourEngine;
import com.badlogicgames.jnn.engines.ExactNearestNeighbourEngine.TopKSelection;

public class Benchmark {
    static float[] randomVector(int numDimensions) {
        var vector = new float[numDimensions];
        for (int j = 0; j < numDimensions; j++) {
            vector[j] = (float) (Math.random() * 2 - 1);
        }
        return vector;
    }

    public static void deleteDirectory(File dir) {
        try {
            Files.walk(dir.toPath())
                    .sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.delete(path);
                        } catch (IOException e) {
                            System.err.printf("Unable to delete path : %s%n%s", path, e);
                        }
                    });
        } catch (Throwable t) {
            throw new RuntimeException(t);
        }
    }

    public static List<VectorDocument> randomDocuments(int numDocuments, int numDimensions) {
        var docs = new ArrayList<VectorDocument>(numDocuments);
        for (int i = 0; i < numDocuments; i++) {
            var doc = new VectorDocument();
            doc.uri = "doc-" + i;
            doc.index = 0;
            doc.title = "title-" + i;
            doc.text = "text";
            doc.tokenCount = 0;
            doc.vector = randomVector(numDimensions);
            docs.add(doc);
        }
        return docs;
    }

    public static void main(String[] args) {
        var numDocuments = 32000;
        var numDimensions = 1796;
        var docs = randomDocuments(numDocuments, numDimensions);

        try {
            ExactNearestNeighbourEngine[] engines = new ExactNearestNeighbourEngine[1];
            NearestNeighbourEngineProvider engineProvider = (numDims) -> {
                engines[0] = new ExactNearestNeighbourEngine(numDims, 1, TopKSelection.HEAP_SELECTION);
                return engines[0];
            };
            var store = new VectorStore("tmp", engineProvider);
            store.createCollection("test");
            store.addDocuments("test", docs.toArray(new VectorDocument[docs.size()]));

            var queryVector = randomVector(numDimensions);
            float sum = 0;
            long start = System.nanoTime();
            int numIterations = 1000;
            for (int i = 0; i < numIterations; i++) {
                var result = store.query("test", queryVector, 50);
                sum += result[0].similarity;
            }
            float took = (System.nanoTime() - start) / 1e9f;
            System.out.println(sum);
            System.out.println(took + " secs");
            System.out.println(numIterations / took + " queries/sec");
            System.out.println(took / numIterations + " secs/query");
            System.out.println("Avg. dot: " + (engines[0].dotTimes / 1e6d) / engines[0].numQueries + " ms");
            System.out.println("Avg. sort: " + (engines[0].selectionTimes / 1e6d) / engines[0].numQueries + " ms");
        } finally {
            deleteDirectory(new File("tmp"));
        }
    }
}
