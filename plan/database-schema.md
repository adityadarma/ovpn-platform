# Database Schema - VPN Platform

## Tables Overview

Main entities:

-   users
-   vpn_nodes
-   vpn_sessions
-   vpn_policies
-   certificates
-   tasks

------------------------------------------------------------------------

## users

  column          type        description
  --------------- ----------- -----------------
  id              uuid        primary key
  username        varchar     vpn username
  password_hash   varchar     hashed password
  role            varchar     admin / user
  created_at      timestamp   created time
  updated_at      timestamp   updated time

------------------------------------------------------------------------

## vpn_nodes

  column       type        description
  ------------ ----------- ------------------
  id           uuid        node id
  hostname     varchar     node hostname
  ip_address   varchar     node public ip
  status       varchar     online / offline
  last_seen    timestamp   heartbeat time

------------------------------------------------------------------------

## vpn_sessions

  column            type        description
  ----------------- ----------- -----------------
  id                uuid        session id
  user_id           uuid        user
  node_id           uuid        vpn node
  vpn_ip            varchar     assigned vpn ip
  connected_at      timestamp   connection time
  disconnected_at   timestamp   disconnect time

------------------------------------------------------------------------

## vpn_policies

  column            type      description
  ----------------- --------- --------------------
  id                uuid      policy id
  user_id           uuid      user
  allowed_network   varchar   CIDR
  description       text      policy description

------------------------------------------------------------------------

## certificates

  column       type        description
  ------------ ----------- ----------------------
  id           uuid        cert id
  user_id      uuid        owner
  cert_path    varchar     certificate location
  revoked      boolean     revoked status
  created_at   timestamp   creation time

------------------------------------------------------------------------

## tasks

  column       type        description
  ------------ ----------- ----------------
  id           uuid        task id
  node_id      uuid        target node
  action       varchar     task type
  payload      json        task data
  status       varchar     pending / done
  created_at   timestamp   time
