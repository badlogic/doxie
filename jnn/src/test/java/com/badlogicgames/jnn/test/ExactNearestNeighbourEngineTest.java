package com.badlogicgames.jnn.test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import com.badlogicgames.jnn.Linalg;
import com.badlogicgames.jnn.engines.ExactNearestNeighbourEngine;
import com.badlogicgames.jnn.engines.ExactNearestNeighbourEngine.TopKSelection;

public class ExactNearestNeighbourEngineTest {
    @Test
    public void testBasics() {
        var numVectors = 20;
        var numDimensions = 123;
        var k = 3;
        var vectors = Benchmark.randomDocuments(1000, numDimensions).stream().map((doc) -> doc.vector).map((vector) -> {
            Linalg.norm(vector, 0, numDimensions);
            return vector;
        }).toList()
                .toArray(new float[numVectors][]);
        var queryVector = Benchmark.randomVector(numDimensions);
        Linalg.norm(queryVector, 0, numDimensions);

        var baselineEngine = new ExactNearestNeighbourEngine(numDimensions, 1, TopKSelection.SORT_SELECTION);
        baselineEngine.addVectors(vectors);
        var baselineResult = baselineEngine.query(queryVector, k);
        assertEquals(baselineResult.length, k);

        var parallelEngine = new ExactNearestNeighbourEngine(numDimensions, 7, TopKSelection.SORT_SELECTION);
        parallelEngine.addVectors(vectors);
        var parallelResult = parallelEngine.query(queryVector, k);
        assertEquals(parallelResult.length, k);
        assertArrayEquals(baselineResult, parallelResult);

        var heapEngine = new ExactNearestNeighbourEngine(numDimensions, 7, TopKSelection.HEAP_SELECTION);
        heapEngine.addVectors(vectors);
        var heapResults = heapEngine.query(queryVector, k);
        assertEquals(heapResults.length, k);
        assertArrayEquals(baselineResult, heapResults);
    }
}
