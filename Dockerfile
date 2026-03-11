FROM node:20-alpine

WORKDIR /app

# Install curl and unzip for downloading cities data
RUN apk add --no-cache curl unzip

COPY package*.json ./
RUN npm ci

COPY . .

# Download GeoNames cities15000 (cities with population > 15000) and build SQLite DB
RUN mkdir -p data && \
  curl -sL -o data/cities15000.zip "https://download.geonames.org/export/dump/cities15000.zip" && \
  unzip -o data/cities15000.zip -d data && \
  npm run build-db && \
  rm -f data/cities15000.zip data/cities15000.txt

EXPOSE 8080

CMD ["node", "server.js"]
