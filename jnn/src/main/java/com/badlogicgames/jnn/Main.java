package com.badlogicgames.jnn;

import com.badlogicgames.jnn.engines.ExactNearestNeighbourEngine;
import com.badlogicgames.jnn.engines.ExactNearestNeighbourEngine.TopKSelection;

public class Main {

    public static void main(String[] args) {
        var port = Integer.parseInt(System.getenv("JNN_PORT"));
        System.out.println("Starting vector store server on port " + port);
        new VectorStoreServer(port, "tmp",
                (numDimensions) -> new ExactNearestNeighbourEngine(numDimensions, 4, TopKSelection.SORT_SELECTION));
    }
}