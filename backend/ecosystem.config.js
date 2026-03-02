module.exports = {
  apps: [{
    name: 'blog-backend',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    time: true,
    max_memory_restart: '500M',
    // Redémarrage automatique en cas de crash
    autorestart: true,
    // Délai entre les redémarrages
    restart_delay: 4000,
    // Max de redémarrages en 1 minute
    max_restarts: 10,
    // Attendre que l'app soit prête
    wait_ready: true,
    // Timeout pour le listen_timeout
    listen_timeout: 10000,
    // Kill timeout
    kill_timeout: 5000,
  }]
};
