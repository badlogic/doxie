package com.badlogicgames.jnn;

import com.badlogicgames.jnn.VectorStore.NearestNeighbourEngine;

import io.undertow.Undertow;
import io.undertow.UndertowOptions;
import io.undertow.server.HttpHandler;
import io.undertow.server.HttpServerExchange;
import io.undertow.util.StatusCodes;

public class VectorStoreServer {
    public static interface EngineProvider {
        NearestNeighbourEngine provide(int numDimensions);
    }

    static class Requests implements HttpHandler {
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
                case "/update":
                    if (exchange.getRequestMethod().equalToString("POST")) {
                        handleUpdate(exchange);
                    }
                    break;
                case "/query":
                    if (exchange.getRequestMethod().equalToString("POST")) {
                        handleQuery(exchange);
                    }
                    break;
                default:
                    exchange.setStatusCode(StatusCodes.NOT_FOUND);
                    exchange.getResponseSender().send("Endpoint not found");
            }
        }

        private void handleQuery(HttpServerExchange exchange) {
            throw new UnsupportedOperationException("Unimplemented method 'handleQuery'");
        }

        private void handleUpdate(HttpServerExchange exchange) {
            throw new UnsupportedOperationException("Unimplemented method 'handleUpdate'");
        }

        private void handleDelete(HttpServerExchange exchange) {
            throw new UnsupportedOperationException("Unimplemented method 'handleDelete'");
        }

        private void handleCreate(HttpServerExchange exchange) {
            throw new UnsupportedOperationException("Unimplemented method 'handleCreate'");
        }
    }

    Undertow server;

    public VectorStoreServer(int port, String dataDir, EngineProvider engineProvider) {
        Undertow.Builder builder = Undertow.builder();
        builder.setHandler(new Requests());
        int processors = Runtime.getRuntime().availableProcessors();
        builder.setIoThreads(Math.max(processors, 2));
        builder.setWorkerThreads(processors * 10);
        builder.setDirectBuffers(true);
        builder.setBufferSize(1024 * 1024 * 2);
        builder.setServerOption(UndertowOptions.MAX_HEADER_SIZE, 3 * 1024);
        builder.setServerOption(UndertowOptions.MAX_ENTITY_SIZE, 1024 * 1024 * 2l);
        builder.setServerOption(UndertowOptions.MULTIPART_MAX_ENTITY_SIZE, 1024 * 1024 * 10l);
        builder.setServerOption(UndertowOptions.MAX_PARAMETERS, 1);
        builder.setServerOption(UndertowOptions.MAX_HEADERS, 20);
        builder.setServerOption(UndertowOptions.MAX_COOKIES, 0);
        builder.setServerOption(UndertowOptions.DECODE_URL, false);
        builder.setServerOption(UndertowOptions.ALWAYS_SET_DATE, false);
        builder.addHttpListener(port, "localhost");
        server = builder.build();
        server.start();
    }

    public void stop() {
        server.stop();
    }
}
