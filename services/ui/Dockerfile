# Use official Node.js image as base
FROM node:22-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json first (to optimize caching)
COPY package.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

EXPOSE 5173

# Start the application
CMD ["npm", "run", "dev"]