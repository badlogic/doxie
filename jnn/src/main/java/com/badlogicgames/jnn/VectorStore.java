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
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.badlogicgames.jnn.engines.NearestNeighbourEngine;
import com.badlogicgames.jnn.engines.NearestNeighbourEngine.EngineSimilarity;

public class VectorStore {
    public static String FILE_SUFFIX = ".vsb";

    public static interface NearestNeighbourEngineProvider {
        NearestNeighbourEngine provide(int numDimensions);
    }

    public static class VectorCollection {
        String id;
        int numDimensions;
        List<VectorDocument> documents = new ArrayList<>();
        NearestNeighbourEngine engine;

        public VectorCollection(String id) {
            this(id, 0, null);
        }

        public VectorCollection(String id, int numDimensions, NearestNeighbourEngine engine) {
            this.id = id;
            this.numDimensions = numDimensions;
            this.engine = engine;
        }
    }

    public static class VectorCollectionInfo {
        public String id;
        public int numDimensions;
        public int numDocuments;

        public VectorCollectionInfo() {
        }

        public VectorCollectionInfo(String id, int numDimensions, int numDocuments) {
            this.id = id;
            this.numDimensions = numDimensions;
            this.numDocuments = numDocuments;
        }
    }

    public static class VectorDocument {
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

    public static class VectorStoreSimilarity {
        public float similarity;
        public VectorDocument doc;

        public VectorStoreSimilarity(float similarity, VectorDocument doc) {
            this.similarity = similarity;
            this.doc = doc;
        }
    }

    Map<String, VectorCollection> collections = new HashMap<>();
    File dataDir;
    NearestNeighbourEngineProvider engineProvider;

    public VectorStore(String dataDirPath, NearestNeighbourEngineProvider engineProvider) {
        this.dataDir = new File(dataDirPath);
        this.engineProvider = engineProvider;
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
                    var numDimensions = docs.get(0).vector.length;
                    var collection = new VectorCollection(id, numDimensions, engineProvider.provide(numDimensions));
                    collection.documents = docs;
                    float[][] vectors = new float[docs.size()][];
                    for (int i = 0; i < docs.size(); i++) {
                        vectors[i] = docs.get(i).vector;
                    }
                    collection.engine.addVectors(vectors);
                    collections.put(id, collection);
                } catch (Throwable t) {
                    System.err.println("Could not load file for collection " + id);
                }
            }
            System.out.println("Loading complete");
        } else {
            if (!dataDir.mkdirs())
                throw new RuntimeException("Could not create output directory " + dataDir.getAbsolutePath());
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

    public synchronized void createCollection(String id) {
        if (collections.containsKey(id))
            return;
        collections.put(id, new VectorCollection(id));
    }

    public synchronized void deleteCollection(String id) {
        if (collections.containsKey(id)) {
            collections.remove(id);
            var file = new File(dataDir, id + FILE_SUFFIX);
            if (file.exists()) {
                if (!file.delete())
                    throw new RuntimeException("Could not delete collection file " + file.getAbsolutePath());
            }
        }
    }

    public synchronized List<VectorCollectionInfo> getCollections() {
        var result = new ArrayList<VectorCollectionInfo>();
        for (var key : this.collections.keySet()) {
            var collection = this.collections.get(key);
            result.add(new VectorCollectionInfo(key, collection.numDimensions, collection.documents.size()));
        }
        return result;
    }

    public synchronized void addDocuments(String id, VectorDocument[] documents) {
        if (documents.length == 0)
            return;
        VectorCollection collection = collections.get(id);
        if (collection == null)
            throw new RuntimeException("No collection with id " + id);
        if (collection.numDimensions == 0) {
            collection.numDimensions = documents[0].vector.length;
            collection.engine = engineProvider.provide(collection.numDimensions);
        }
        for (VectorDocument doc : documents) {
            if (doc.vector.length != collection.numDimensions)
                throw new RuntimeException("Invalid vector length. Expected: " + collection.numDimensions + ", actual: "
                        + doc.vector.length + ", uri: " + doc.uri + ", index: " + doc.index);
            Linalg.norm(doc.vector, 0, doc.vector.length);
            collection.documents.add(doc);
        }
        float[][] vectors = new float[documents.length][];
        for (int i = 0; i < documents.length; i++) {
            vectors[i] = documents[i].vector;
        }
        collection.engine.addVectors(vectors);
        saveDocuments(id, documents);
    }

    public List<VectorDocument> getDocuments(String id, int offset, int limit) {
        VectorCollection collection = collections.get(id);
        if (collection == null)
            throw new RuntimeException("No collection with id " + id);

        List<VectorDocument> docs = collection.documents;
        if (offset < 0 || offset >= docs.size())
            return Collections.EMPTY_LIST;

        int endIndex = Math.min(offset + limit, docs.size());
        List<VectorDocument> sublist = docs.subList(offset, endIndex);

        return sublist;
    }

    public VectorStoreSimilarity[] query(String id, float[] queryVector, int k) {
        VectorCollection collection = collections.get(id);
        if (collection == null)
            throw new RuntimeException("No collection with id " + id);
        if (queryVector.length != collection.numDimensions)
            throw new RuntimeException(
                    "Invalid vector length. Expected: " + collection.numDimensions + ", actual: " + queryVector.length);

        EngineSimilarity[] engineSimilarities = collection.engine.query(queryVector, k);
        VectorStoreSimilarity[] similarities = new VectorStoreSimilarity[engineSimilarities.length];
        for (int i = 0; i < similarities.length; i++) {
            var engineSimilarity = engineSimilarities[i];
            similarities[i] = new VectorStoreSimilarity(engineSimilarity.similarity,
                    collection.documents.get(engineSimilarity.index));
        }
        return similarities;
    }
}
