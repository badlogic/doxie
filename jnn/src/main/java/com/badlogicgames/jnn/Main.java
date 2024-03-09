package com.badlogicgames.gann;

public class Main {

    public static void main(String[] args) {
        var port = 3333;
        new VectorStoreServer(port, "tmp", (numDimensions) -> new VectorStore.ExactNearestNeighbourEngine(0, 4));
    }
}