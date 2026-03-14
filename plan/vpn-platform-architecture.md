# VPN Platform Architecture

## Overview

Project ini bertujuan membuat **platform manajemen VPN terpusat** yang
dapat:

-   Mengelola user VPN
-   Menghasilkan konfigurasi client otomatis
-   Mengontrol akses jaringan
-   Memonitor session VPN
-   Mengelola beberapa server VPN (node)

Konsepnya mirip dengan:

-   Pritunl
-   Tailscale admin
-   Netmaker

Tetapi berbasis **OpenVPN** dan dapat dikembangkan secara custom.

------------------------------------------------------------------------

# 1. Arsitektur Sistem

Sistem terdiri dari **3 komponen utama**.

    VPN Manager (control plane)
            │
            │ API
            │
            ▼
    VPN Agent (node controller)
            │
            │ control system
            │
            ▼
    OpenVPN Server (tunnel engine)
            │
            ▼
    VPN Client

### VPN Manager

Server pusat yang mengontrol semua node VPN.

Fungsi: - Web UI - REST API - User management - Policy network -
Monitoring session - Generate config `.ovpn`

### VPN Agent

Agent yang berjalan di server VPN.

Fungsi: - menerima perintah manager - membuat rule firewall - memonitor
session VPN - menjalankan command sistem

Agent bertindak sebagai **executor**.

### OpenVPN Server

Engine VPN yang membuat secure tunnel.

------------------------------------------------------------------------

# 2. Konsep Agent Execution

Agent mengeksekusi task dari manager.

    Manager
       │
       ▼
    Create task
       │
       ▼
    Agent receive task
       │
       ▼
    Execute command
       │
       ▼
    Return result

Contoh task:

``` json
{
  "type": "create_user",
  "username": "developer",
  "network": "10.8.0.10"
}
```

Agent akan: 1. generate certificate 2. update config 3. reload openvpn

------------------------------------------------------------------------

# 3. Jenis Task yang Bisa Dieksekusi Agent

## VPN Control

    create_vpn_user
    revoke_vpn_user
    reload_openvpn
    generate_client_config

## Firewall Control

Contoh rule:

``` bash
iptables -A FORWARD -s 10.8.0.10 -d 10.0.0.0/24 -j ACCEPT
```

Task:

    add_firewall_rule
    remove_firewall_rule
    apply_network_policy

## Session Monitoring

Agent membaca:

    /var/log/openvpn-status.log

Contoh event:

``` json
{
  "user": "developer",
  "ip": "10.8.0.10",
  "status": "connected"
}
```

------------------------------------------------------------------------

# 4. Komponen Sistem

Minimal ada **6 komponen utama**.

## Manager API

Stack:

    Node.js
    TypeScript
    PostgreSQL
    JWT

## VPN Agent

Daemon yang berjalan di node VPN.

## OpenVPN Controller

    startOpenVPN()
    reloadOpenVPN()
    addClient()
    revokeClient()

## Certificate Manager

    easy-rsa
    atau
    native x509

## Firewall Controller

    iptables
    nftables

## Session Monitor

    OpenVPN management interface
    atau
    openvpn-status.log

------------------------------------------------------------------------

# 5. Struktur Repository

    vpn-platform
    │
    ├── manager
    ├── agent
    ├── web-ui
    ├── database
    └── docker

------------------------------------------------------------------------

# 6. Arsitektur Docker

    docker-compose
    │
    ├── vpn
    │   └── OpenVPN
    ├── agent
    ├── manager
    ├── postgres
    └── web-ui

Manager dan agent:

    user: nobody

OpenVPN membutuhkan:

    CAP_NET_ADMIN
    /dev/net/tun

------------------------------------------------------------------------

# 7. Flow Sistem

## Admin membuat user VPN

    Admin
     │
     ▼
    Manager API
     │
     ▼
    Generate certificate
     │
     ▼
    Store database
     │
     ▼
    Send task to agent
     │
     ▼
    Agent apply config

## User connect VPN

    User VPN Client
          │
          ▼
    OpenVPN Server
          │
          ▼
    Auth Script
          │
          ▼
    Manager API
          │
          ▼
    Validate user

## Monitoring

    OpenVPN
     │
     ▼
    Agent read status
     │
     ▼
    Send event
     │
     ▼
    Manager dashboard

------------------------------------------------------------------------

# 8. Security

## Communication

    mTLS manager ↔ agent

## Protection

    rate limit
    fail2ban
    audit log

## Secret

    Vault
    KMS
    Docker secrets

------------------------------------------------------------------------

# 9. Deployment

## Distributed

    Manager Server
     ├─ API
     ├─ Database
     └─ Web UI

    VPN Node
     ├─ OpenVPN
     └─ Agent

## Single Server

    VPN Manager
    │
    ├── API
    ├── Executor
    ├── OpenVPN
    └── Firewall

------------------------------------------------------------------------

# 10. Tujuan Akhir

Platform ini memungkinkan:

-   manajemen user VPN
-   manajemen node VPN
-   policy jaringan
-   monitoring koneksi
-   pembuatan konfigurasi client otomatis

------------------------------------------------------------------------

# 11. Architecture Pattern

    Control Plane
    +
    Agent

Digunakan oleh:

-   Kubernetes
-   Tailscale
-   Netmaker

------------------------------------------------------------------------

# Conclusion

Project ini adalah **VPN management platform** berbasis OpenVPN dengan
arsitektur:

-   Manager (control plane)
-   Agent (executor)
-   OpenVPN (network tunnel)
