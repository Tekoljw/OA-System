import { createProxyMiddleware } from 'http-proxy-middleware';

export default function(app) {
  // 代理所有/api请求到后端服务器
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '/api', // 不需要重写路径
      },
      onProxyReq: (proxyReq, req, res) => {
        // 确保cookie和认证信息正确传递
        if (req.headers.cookie) {
          proxyReq.setHeader('Cookie', req.headers.cookie);
        }
      },
      logLevel: 'debug',
    })
  );
};