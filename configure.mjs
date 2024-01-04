import * as fs from "fs";
import * as crypto from "crypto";

const error = (msg) => {
    console.error(msg);
    process.exit(-1);
};

const replaceInFile = (map, filePath) => {
    console.log("Replacing placeholders in " + filePath);
    let content = fs.readFileSync(filePath, "utf8");
    for (const [key, value] of map.entries()) {
        const regex = new RegExp(key, "g");
        content = content.replace(regex, value);
    }
    fs.writeFileSync(filePath, content, "utf8");
};

const generateSecurePassword = (length = 32) => {
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let password = "";
    while (password.length < length) {
        const byte = crypto.randomBytes(1);
        const idx = byte[0] % charset.length;
        password += charset.charAt(idx);
    }
    return password;
};

const pkg = JSON.parse(fs.readFileSync("package.json"));
console.log("Applying config", pkg.app);

if (!pkg.app) error("No app config in package.json");
if (!pkg.app.name) error("Missing name, e.g. MyApp");
if (!pkg.app.description) error("Missing description, e.g. 'A super app'");
if (!pkg.app.host) error("Missing host, e.g. myserver.hetzner.de");
if (!pkg.app.hostDir) error("Missing host dir, e.g. /home/badlogic");
if (!pkg.app.serverPort) error("Missing server port, e.g. 3333");
if (!pkg.app.domain) error("Missing domain, e.g. myapp.io");
if (!pkg.app.email) error("Missing email");

const dbName = pkg.app.name.toUpperCase() + "_DB";
const dbUser = pkg.app.name.toUpperCase() + "_DB_USER";
const dbPassword = pkg.app.name.toUpperCase() + "_DB_PASSWORD";
const secrets = `export ${dbName}=$${dbName} && export ${dbUser}=$${dbUser} && export ${dbPassword}=$${dbPassword}`;

const replacements = new Map([
    ["__app_name__", pkg.app.name],
    ["__app_description__", pkg.app.description],
    ["__app_host__", pkg.app.host],
    ["__app_host_dir__", pkg.app.hostDir],
    ["__app_server_port__", pkg.app.serverPort],
    ["__app_domain__", pkg.app.domain],
    ["__app_email__", pkg.app.email],
    ["__app_secrets__", secrets],
    ["__app_db_name__", "${" + dbName + "}"],
    ["__app_db_user__", "${" + dbUser + "}"],
    ["__app_db_password__", "${" + dbPassword + "}"],
]);

console.log("Replacements", replacements);

replaceInFile(replacements, "package.json");
replaceInFile(replacements, "publish.sh");
replaceInFile(replacements, "stats.sh");
replaceInFile(replacements, "docker/docker-compose.base.yml");
replaceInFile(replacements, "docker/docker-compose.prod.yml");
replaceInFile(replacements, "docker/nginx.conf");
replaceInFile(replacements, "docker/control.sh");
replaceInFile(replacements, "html/index.html");
replaceInFile(replacements, "html/manifest.json");

console.log("ATTENTION!");
console.log("Please add the following environment variables to your environment");
console.log();
console.log(`echo '' >> ~/.zshrc`);
console.log(`echo '' >> ~/.zshrc`);
console.log(`echo 'export ${dbName}="${dbName.toLowerCase()}"' >> ~/.zshrc`);
console.log(`echo 'export ${dbUser}="${dbUser.toLowerCase()}"' >> ~/.zshrc`);
console.log(`echo 'export ${dbPassword}="${generateSecurePassword()}"' >> ~/.zshrc`);
console.log(`source ~/.zshrc`);
