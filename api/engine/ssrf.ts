import { URL } from 'node:url'

const BLOCKED_IPS = [
  { prefix: '10.', type: 'private' },
  { prefix: '127.', type: 'loopback' },
  { prefix: '169.254.', type: 'link-local' },
  { prefix: '172.16.', type: 'private' },
  { prefix: '172.17.', type: 'private' },
  { prefix: '172.18.', type: 'private' },
  { prefix: '172.19.', type: 'private' },
  { prefix: '172.20.', type: 'private' },
  { prefix: '172.21.', type: 'private' },
  { prefix: '172.22.', type: 'private' },
  { prefix: '172.23.', type: 'private' },
  { prefix: '172.24.', type: 'private' },
  { prefix: '172.25.', type: 'private' },
  { prefix: '172.26.', type: 'private' },
  { prefix: '172.27.', type: 'private' },
  { prefix: '172.28.', type: 'private' },
  { prefix: '172.29.', type: 'private' },
  { prefix: '172.30.', type: 'private' },
  { prefix: '172.31.', type: 'private' },
  { prefix: '192.168.', type: 'private' },
  { prefix: '0.', type: 'invalid' },
  { prefix: '240.', type: 'reserved' },
  { prefix: '::1', type: 'loopback' },
  { prefix: '::', type: 'unspecified' },
  { prefix: 'fc', type: 'unique-local' },
  { prefix: 'fd', type: 'unique-local' },
  { prefix: 'fe80:', type: 'link-local' },
]

export function validateUrl(rawUrl: string): URL {
  const url = new URL(rawUrl)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`不支持的协议: ${url.protocol}`)
  }

  const hostname = url.hostname.toLowerCase()

  // Block DNS rebinding / localhost hostnames
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']
  if (blockedHosts.includes(hostname)) {
    throw new Error(`不允许访问内网地址: ${hostname}`)
  }

  // Block internal TLDs
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
    throw new Error(`不允许访问内部域名: ${hostname}`)
  }

  // Block by IP prefix
  for (const rule of BLOCKED_IPS) {
    if (hostname.startsWith(rule.prefix)) {
      throw new Error(`不允许访问 ${rule.type} 地址: ${hostname}`)
    }
  }

  return url
}
