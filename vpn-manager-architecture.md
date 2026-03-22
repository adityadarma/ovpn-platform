# VPN Manager Architecture (Hybrid Agent + OpenVPN)

## 🎯 Objective

Membangun sistem VPN Manager yang scalable dan modular dengan
komponen: - API (control plane) - Web UI - Agent (node controller) - VPN
Server (OpenVPN, future: WireGuard)

Agent harus mendukung **hybrid environment**: - OpenVPN berjalan di
**host (native install)** - OpenVPN berjalan di **container (Docker)**

------------------------------------------------------------------------

## 🧠 Core Design Principles

1.  **Loose Coupling**
    -   Agent tidak boleh bergantung pada:
        -   systemd
        -   docker exec
        -   OS spesifik
2.  **Abstraction Layer**
    -   Gunakan `VpnDriver` sebagai interface utama
3.  **Single Communication Channel**
    -   Gunakan **OpenVPN Management Interface (TCP)** sebagai
        komunikasi utama
4.  **Security First**
    -   Agent tidak memiliki privilege `NET_ADMIN`
    -   Hanya OpenVPN yang memiliki akses network level
5.  **Extensible**
    -   Mudah menambahkan WireGuard atau VPN lain

------------------------------------------------------------------------

## 🏗️ High-Level Architecture

\[ API / Web \] ↓ \[ Agent \] ↓ \[ Driver Layer \] ↓ \[ OpenVPN
Management Interface \]

------------------------------------------------------------------------

## 🔄 Deployment Modes

### Mode 1: Host-based OpenVPN

-   OpenVPN diinstall langsung di server
-   Agent connect ke: 127.0.0.1:7505

### Mode 2: Container-based OpenVPN

-   OpenVPN berjalan di Docker container
-   Agent connect ke: openvpn:7505

------------------------------------------------------------------------

## 🔌 Communication Standard

Gunakan OpenVPN config:

management 127.0.0.1 7505 management-client-auth status
/var/log/openvpn/status.log status-version 3

------------------------------------------------------------------------

## 🔐 Security Requirements

-   Gunakan password: management 127.0.0.1 7505 /etc/openvpn/mgmt.pass

-   Jangan expose management port ke internet

------------------------------------------------------------------------

## ⚙️ Driver Contract

interface VpnDriver { connect(): Promise`<void>`{=html} disconnect():
Promise`<void>`{=html} getServerInfo(): Promise`<any>`{=html}
getClients(): Promise\<any\[\]\> disconnectClient(commonName: string):
Promise`<void>`{=html} getStatus(): Promise`<any>`{=html} getMetrics():
Promise`<any>`{=html} }

------------------------------------------------------------------------

## 🧠 Agent Responsibilities

-   Monitoring VPN
-   Ambil data client
-   Kirim heartbeat ke API
-   Disconnect client

------------------------------------------------------------------------

## 🏗️ Optional: Service Controller

interface ServiceController { start(): Promise`<void>`{=html} stop():
Promise`<void>`{=html} restart(): Promise`<void>`{=html} }

------------------------------------------------------------------------

## 📦 Container Architecture

### OpenVPN Container

-   NET_ADMIN
-   /dev/net/tun

### Agent Container

-   Tanpa privilege

------------------------------------------------------------------------

## 🚀 Deployment Strategy

### Default

-   OpenVPN container
-   Agent container

### Advanced

-   OpenVPN host
-   Agent container

### Optional

-   All-in-one container

------------------------------------------------------------------------

## ❌ Anti-Patterns

-   docker exec sebagai primary control
-   parsing log sebagai sumber utama
-   agent pakai NET_ADMIN
-   coupling ke OS

------------------------------------------------------------------------

## 🔥 Future Roadmap

-   WireGuard support
-   Multi-driver
-   CLI installer
-   Monitoring

------------------------------------------------------------------------

## 🎯 Summary

-   Agent harus hybrid
-   Gunakan management interface
-   Fokus scalability & security
