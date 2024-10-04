FROM amazonlinux:2023

# Install necessary tools
RUN yum update -y && \
    yum install -y git tar

# Install NVM
ENV NVM_DIR /root/.nvm
ENV NODE_VERSION 20.17.0
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash && \
    . $NVM_DIR/nvm.sh && \
    nvm install $NODE_VERSION && \
    nvm alias default $NODE_VERSION && \
    nvm use default

# Add node and npm to path so the commands are available
ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

# Verify installations
RUN node --version
RUN npm --version

# Set the working directory
WORKDIR /app
