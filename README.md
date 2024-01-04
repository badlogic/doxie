# app-template

Used to create new (progressive) web apps and deploy them to a server running Docker and nginx-proxy for SSL cert generation.

### Development

1. Install & run Docker
2. Install NodeJS +19

```
npm run dev
```

In VS Code run the `server` and `client` launch configurations.

### Deployment

1. Deploy backend & frontend: `./publish.sh server`
1. Deploy just the frontend: `./publish.sh`
