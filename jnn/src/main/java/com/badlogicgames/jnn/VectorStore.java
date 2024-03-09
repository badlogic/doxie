package com.badlogicgames.jnn;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilenameFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;

public class VectorStore {
    public static String FILE_SUFFIX = ".vsb";

    public static class EngineSimilarity {
        int index;
        float similarity;
    }

    public static interface NearestNeighbourEngine {
        void addVectors(VectorDocument[] document);

        EngineSimilarity[] query(float[] query);

        int numVectors();
    }

    public static class ExactNearestNeighbourEngine implements NearestNeighbourEngine {
        int numDimensions;
        int cpus;
        float[] vectors;
        EngineSimilarity[] similarities;
        ExecutorService executor;

        public ExactNearestNeighbourEngine(int numDimensions, int cpus) {
            this.numDimensions = numDimensions;
            this.cpus = cpus;
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
        public void addVectors(VectorDocument[] documents) {
            float[] newVectors = new float[vectors.length + documents.length * numDimensions];
            System.arraycopy(vectors, 0, newVectors, 0, vectors.length);
            int offset = vectors.length;
            for (VectorDocument doc : documents) {
                System.arraycopy(doc.vector, 0, newVectors, offset, numDimensions);
                offset += numDimensions;
            }
            vectors = newVectors;

            var newSimilarities = new EngineSimilarity[numVectors() + documents.length];
            System.arraycopy(similarities, 0, newSimilarities, 0, similarities.length);
            for (int i = similarities.length; i < newSimilarities.length; i++) {
                newSimilarities[i] = new EngineSimilarity();
            }
            similarities = newSimilarities;
        }

        @Override
        public EngineSimilarity[] query(float[] query) {
            int totalVectors = numVectors();
            int chunkSize = (int) Math.ceil(totalVectors / (double) cpus);
            List<Future<?>> futures = new ArrayList<>();

            for (int i = 0; i < similarities.length; i++) {
                var similarity = similarities[i];
                similarity.index = i;
            }

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

            Arrays.sort(similarities, (o1, o2) -> Float.compare(o2.similarity, o1.similarity));
            return similarities;
        }

        @Override
        public int numVectors() {
            return vectors.length / numDimensions;
        }
    }

    public static class VectorCollection {
        String id;
        int numDimensions;
        List<VectorDocument> documents = new ArrayList<>();

        public VectorCollection(String id, int numDimensions) {
            this.id = id;
            this.numDimensions = numDimensions;
        }
    }

    public static class VectorDocument {
        public String collectionId;
        public String uri;
        public int index;
        public String title;
        public String text;
        public int tokenCount;
        public float[] vector;

        public static void writeString(String str, DataOutputStream out) throws IOException {
            var bytes = str.getBytes(StandardCharsets.UTF_8);
            out.writeInt(bytes.length);
            out.write(bytes);
        }

        public static String readString(DataInputStream in) throws IOException {
            int length = in.readInt();
            byte[] bytes = new byte[length];
            in.readFully(bytes);
            return new String(bytes, StandardCharsets.UTF_8);
        }

        public static void encode(DataOutputStream out, VectorDocument doc) {
            try {
                writeString(doc.uri, out);
                out.writeInt(doc.index);
                writeString(doc.title, out);
                writeString(doc.text, out);
                out.writeInt(doc.tokenCount);
                out.writeInt(doc.vector.length);
                for (float v : doc.vector)
                    out.writeFloat(v);

            } catch (Throwable t) {
                throw new RuntimeException(t);
            }
        }

        public static VectorDocument decode(DataInputStream in) {
            try {
                VectorDocument doc = new VectorDocument();
                doc.uri = readString(in);
                doc.index = in.readInt();
                doc.title = readString(in);
                doc.text = readString(in);
                doc.tokenCount = in.readInt();
                int vectorLength = in.readInt();
                doc.vector = new float[vectorLength];
                for (int i = 0; i < vectorLength; i++) {
                    doc.vector[i] = in.readFloat();
                }
                return doc;
            } catch (Throwable t) {
                throw new RuntimeException(t);
            }
        }

    }

    public static class VectorSimilarity {
        public float similarity;
        public VectorDocument doc;

        public VectorSimilarity(float similarity, VectorDocument doc) {
            this.similarity = similarity;
            this.doc = doc;
        }
    }

    Map<String, VectorCollection> collections = new HashMap<>();
    File dataDir;
    NearestNeighbourEngine engine;

    public VectorStore(String dataDirPath, NearestNeighbourEngine engine) {
        this.dataDir = new File(dataDirPath);
        this.engine = engine;
        if (dataDir.exists()) {
            var files = dataDir.listFiles(new FilenameFilter() {
                @Override
                public boolean accept(File dir, String name) {
                    return name.endsWith(FILE_SUFFIX);
                }
            });
            for (var file : files) {
                var id = file.getName().substring(0, file.getName().length() - FILE_SUFFIX.length());
                System.out.println("Loading collection " + id);
                try {
                    var docs = loadDocuments(id);
                    var collection = new VectorCollection(id, docs.get(0).vector.length);
                    collection.documents = docs;
                    collections.put(id, collection);
                } catch (Throwable t) {
                    System.err.println("Could not load file for collection " + id);
                }
            }
        } else {
            if (!dataDir.mkdirs())
                throw new RuntimeException("Could not create output directory " + dataDir.getAbsolutePath());
        }
    }

    public synchronized void createCollection(String id, int numDimensions) {
        if (collections.containsKey(id))
            return;
        collections.put(id, new VectorCollection(id, numDimensions));
    }

    public synchronized void deleteCollection(String id) {
        if (collections.containsKey(id)) {
            collections.remove(id);
            var file = new File(dataDir, id + FILE_SUFFIX);
            if (!file.delete())
                throw new RuntimeException("Could not delete collection file " + file.getAbsolutePath());
        }
    }

    private synchronized void saveDocuments(String id, VectorDocument[] documents) {
        File file = new File(dataDir, id + FILE_SUFFIX);
        long start = System.nanoTime();
        try (DataOutputStream out = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(file, true)))) {
            for (VectorDocument doc : documents) {
                VectorDocument.encode(out, doc);
            }
        } catch (Throwable e) {
            throw new RuntimeException(e);
        } finally {
            System.out.println("Saving collection " + id + " took: " + (System.nanoTime() - start) / 1e9f + " secs");
        }
    }

    private synchronized List<VectorDocument> loadDocuments(String id) {
        List<VectorDocument> documents = new ArrayList<>();
        File file = new File(dataDir, id + FILE_SUFFIX);

        try (DataInputStream in = new DataInputStream(new BufferedInputStream(new FileInputStream(file)))) {
            while (in.available() > 0) {
                VectorDocument doc = VectorDocument.decode(in);
                documents.add(doc);
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to load documents", e);
        }

        return documents;
    }

    public synchronized void addDocuments(String id, VectorDocument[] documents) {
        if (documents.length == 0)
            return;
        VectorCollection collection = collections.get(id);
        if (collection == null)
            throw new RuntimeException("No collection with id " + id);
        for (VectorDocument doc : documents) {
            if (doc.vector.length != collection.numDimensions)
                throw new RuntimeException("Invalid vector length. Expected: " + collection.numDimensions + ", actual: "
                        + doc.vector.length + ", uri: " + doc.uri + ", index: " + doc.index);
            Linalg.norm(doc.vector);
            collection.documents.add(doc);
        }
        this.engine.addVectors(documents);
        saveDocuments(id, documents);
    }

    public VectorSimilarity[] query(String id, float[] queryVector, int k) {
        VectorCollection collection = collections.get(id);
        if (collection == null)
            throw new RuntimeException("No collection with id " + id);
        if (queryVector.length != collection.numDimensions)
            throw new RuntimeException(
                    "Invalid vector length. Expected: " + collection.numDimensions + ", actual: " + queryVector.length);

        EngineSimilarity[] engineSimilarities = engine.query(queryVector);
        VectorSimilarity[] similarities = new VectorSimilarity[Math.min(engineSimilarities.length, k)];
        for (int i = 0; i < similarities.length; i++) {
            var engineSimilarity = engineSimilarities[i];
            similarities[i] = new VectorSimilarity(engineSimilarity.similarity,
                    collection.documents.get(engineSimilarity.index));
        }
        return similarities;
    }
}
