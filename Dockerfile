# Railway builds this file automatically when it exists (it takes priority over nixpacks.toml / Railpack).
# tesseract-ocr reads scanned pages so their text can be published as real HTML (SEO).
# poppler-utils provides "pdftoppm", which turns every PDF page into an image so it can be blurred on the server.
# libreoffice (writer + calc) converts Word / Excel / text files to PDF so they are shown exactly as uploaded.
FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng ca-certificates \
    libreoffice-writer libreoffice-calc fonts-liberation fonts-dejavu-core fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "backend/server.js"]
