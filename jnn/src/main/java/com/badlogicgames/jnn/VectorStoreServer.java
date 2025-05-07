package com.badlogicgames.jnn;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import com.badlogicgames.jnn.VectorStore.NearestNeighbourEngineProvider;
import com.badlogicgames.jnn.VectorStore.VectorDocument;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;

import io.undertow.Undertow;
import io.undertow.UndertowOptions;
import io.undertow.server.HttpHandler;
import io.undertow.server.HttpServerExchange;
import io.undertow.util.Headers;
import io.undertow.util.StatusCodes;

public class VectorStoreServer {

    public static class OutputVectorDocument {
        public String uri;
        public int index;
        public String title;
        public String text;
        public int tokenCount;
        public float distance;

        public OutputVectorDocument(VectorDocument doc, float distance) {
            this.uri = doc.uri;
            this.index = doc.index;
            this.title = doc.title;
            this.text = doc.text;
            this.tokenCount = doc.tokenCount;
            this.distance = distance;
        }
    }

    public static class AddRequest {
        public String id;
        public VectorDocument[] docs;
    }

    public static class QueryRequest {
        public String id;
        public float[] queryVector;
        public int k;
    }

    class Requests implements HttpHandler {
        @Override
        public void handleRequest(final HttpServerExchange exchange) throws Exception {
            if (exchange.isInIoThread()) {
                exchange.dispatch(this);
                return;
            }

            switch (exchange.getRequestPath()) {
                case "/create":
                    if (exchange.getRequestMethod().equalToString("GET")) {
                        handleCreate(exchange);
                    }
                    break;
                case "/delete":
                    if (exchange.getRequestMethod().equalToString("GET")) {
                        handleDelete(exchange);
                    }
                    break;
                case "/add":
                    if (exchange.getRequestMethod().equalToString("POST")) {
                        handleAdd(exchange);
                    }
                    break;
                case "/get":
                    if (exchange.getRequestMethod().equalToString("GET")) {
                        handleGet(exchange);
                    }
                    break;
                case "/collections":
                    if (exchange.getRequestMethod().equalToString("GET")) {
                        handleGetCollections(exchange);
                    }
                    break;
                case "/query":
                    if (exchange.getRequestMethod().equalToString("POST")) {
                        handleQuery(exchange);
                    }
                    break;
                case "/ping":
                    exchange.setStatusCode(StatusCodes.OK);
                    exchange.getResponseSender().send("{\"message\": \"pong\"}");
                    break;
                default:
                    exchange.setStatusCode(StatusCodes.NOT_FOUND);
                    exchange.getResponseSender().send("Endpoint not found");
            }
        }

        private void handleCreate(HttpServerExchange exchange) {
            exchange.getResponseHeaders().put(Headers.CONTENT_TYPE, "application/json");

            try {
                String id = exchange.getQueryParameters().get("id").getFirst(); // Assuming 'id' is the query parameter
                                                                                // name
                store.createCollection(id); // Assuming this method call is correct
                exchange.setStatusCode(StatusCodes.OK);
                exchange.getResponseSender().send("{\"message\": \"OK\"}");
            } catch (Exception e) {
                e.printStackTrace();
                exchange.setStatusCode(StatusCodes.INTERNAL_SERVER_ERROR);
                exchange.getResponseSender().send("{\"message\": \"Error creating collection\"}");
            }
        }

        private void handleAdd(HttpServerExchange exchange) {
            exchange.getRequestReceiver().receiveFullString((exchange1, message) -> {
                try {
                    ObjectMapper objectMapper = new ObjectMapper();
                    AddRequest addRequest = objectMapper.readValue(message, AddRequest.class);

                    store.addDocuments(addRequest.id, addRequest.docs);
                    exchange1.getResponseHeaders().put(Headers.CONTENT_TYPE, "application/json");
                    exchange1.setStatusCode(StatusCodes.OK);
                    exchange1.getResponseSender().send("{\"message\": \"Documents added\"}");
                } catch (IOException e) {
                    e.printStackTrace();
                    exchange1.setStatusCode(StatusCodes.BAD_REQUEST);
                    exchange1.getResponseSender().send("{\"message\": \"Invalid request body\"}");
                } catch (Exception e) {
                    e.printStackTrace();
                    exchange1.setStatusCode(StatusCodes.INTERNAL_SERVER_ERROR);
                    exchange1.getResponseSender().send("{\"message\": \"" + e.getMessage() + "\"}");
                }
            });
        }

        private void handleDelete(HttpServerExchange exchange) {
            exchange.getResponseHeaders().put(Headers.CONTENT_TYPE, "application/json");

            try {
                String id = exchange.getQueryParameters().get("id").getFirst();
                store.deleteCollection(id);
                exchange.setStatusCode(StatusCodes.OK);
                exchange.getResponseSender().send("{\"message\": \"OK\"}");
            } catch (Exception e) {
                e.printStackTrace();
                exchange.setStatusCode(StatusCodes.INTERNAL_SERVER_ERROR);
                exchange.getResponseSender().send("{\"message\": \"Error deleting collection\"}");
            }
        }

        private void handleGet(HttpServerExchange exchange) {
            exchange.getResponseHeaders().put(Headers.CONTENT_TYPE, "application/json");
            try {
                String id = exchange.getQueryParameters().get("id").getFirst();
                int offset = Integer.parseInt(exchange.getQueryParameters().get("offset").getFirst());
                int limit = Integer.parseInt(exchange.getQueryParameters().get("limit").getFirst());
                var result = store.getDocuments(id, offset, limit); // Assuming this method call is correct
                ObjectMapper objectMapper = new ObjectMapper();
                var resultList = new ArrayList<OutputVectorDocument>(result.size());
                for (var doc : result) {
                    resultList.add(new OutputVectorDocument(doc, 0));
                }
                String json = objectMapper.writeValueAsString(resultList);
                exchange.setStatusCode(StatusCodes.OK);
                exchange.getResponseSender().send(json);
            } catch (Exception e) {
                e.printStackTrace();
                exchange.setStatusCode(StatusCodes.INTERNAL_SERVER_ERROR);
                exchange.getResponseSender().send("{\"message\": \"Error getting documents from collection\"}");
            }
        }

        private void handleGetCollections(HttpServerExchange exchange) {
            exchange.getResponseHeaders().put(Headers.CONTENT_TYPE, "application/json");
            try {
                ObjectMapper objectMapper = new ObjectMapper();
                String json = objectMapper.writeValueAsString(store.getCollections());
                exchange.setStatusCode(StatusCodes.OK);
                exchange.getResponseSender().send(json);
            } catch (Exception e) {
                e.printStackTrace();
                exchange.setStatusCode(StatusCodes.INTERNAL_SERVER_ERROR);
                exchange.getResponseSender().send("{\"message\": \"Error getting documents from collection\"}");
            }
        }

        private void handleQuery(HttpServerExchange exchange) {
            exchange.getRequestReceiver().receiveFullString((exchange1, message) -> {
                long start = System.nanoTime();
                exchange.getResponseHeaders().put(Headers.CONTENT_TYPE, "application/json");
                try {
                    ObjectMapper objectMapper = new ObjectMapper();
                    QueryRequest queryRequest = objectMapper.readValue(message, QueryRequest.class);

                    var topK = store.query(queryRequest.id, queryRequest.queryVector, queryRequest.k);
                    var resultList = new ArrayList<OutputVectorDocument>(topK.length);
                    for (var doc : topK) {
                        resultList.add(new OutputVectorDocument(doc.doc, doc.similarity));
                    }
                    String json = objectMapper.writeValueAsString(resultList);
                    exchange.setStatusCode(StatusCodes.OK);
                    exchange.getResponseSender().send(json);
                } catch (IOException e) {
                    e.printStackTrace();
                    exchange1.setStatusCode(StatusCodes.BAD_REQUEST);
                    exchange1.getResponseSender().send("{\"message\": \"Invalid request body\"}");
                } catch (Exception e) {
                    e.printStackTrace();
                    exchange1.setStatusCode(StatusCodes.INTERNAL_SERVER_ERROR);
                    exchange1.getResponseSender().send("{\"message\": \"" + e.getMessage() + "\"}");
                }
                // System.out.println("Query took: " + (System.nanoTime() - start) / 1e6d + " ms");
            });
        }
    }

    Undertow server;
    VectorStore store;

    public VectorStoreServer(int port, String dataDir, NearestNeighbourEngineProvider engineProvider) {
        Undertow.Builder builder = Undertow.builder();
        builder.setHandler(new Requests());
        int processors = Runtime.getRuntime().availableProcessors();
        builder.setIoThreads(Math.max(processors, 2));
        builder.setWorkerThreads(processors * 10);
        builder.setDirectBuffers(true);
        builder.setBufferSize(1024 * 1024 * 2);
        builder.setServerOption(UndertowOptions.MAX_HEADER_SIZE, 3 * 1024);
        builder.setServerOption(UndertowOptions.MAX_ENTITY_SIZE, 1024 * 1024 * 200l);
        builder.setServerOption(UndertowOptions.MULTIPART_MAX_ENTITY_SIZE, 1024 * 1024 * 200l);
        builder.setServerOption(UndertowOptions.MAX_PARAMETERS, 5);
        builder.setServerOption(UndertowOptions.MAX_HEADERS, 20);
        builder.setServerOption(UndertowOptions.MAX_COOKIES, 0);
        builder.setServerOption(UndertowOptions.DECODE_URL, false);
        builder.setServerOption(UndertowOptions.ALWAYS_SET_DATE, false);
        builder.addHttpListener(port, "0.0.0.0");
        server = builder.build();
        server.start();

        store = new VectorStore("/data", engineProvider);
    }

    public void stop() {
        server.stop();
    }
}
