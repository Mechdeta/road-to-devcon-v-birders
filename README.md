# Deccan Birders — Decentralized Bird Sightings

> **Road To Devcon V — Problem 2: "Take your records with you"**

A decentralized bird-sighting record system built on the **Swarm decentralized storage network**.

A birder can create a sighting in the Writer application, store it directly on Swarm, receive a content-addressed reference, and share that reference with anyone.

A completely separate Reader application can retrieve and display the record directly from Swarm — **without the original Writer application, without an export/import step, and without a Swarm ID account.**

---

## 🎯 Challenge

The core requirement is:

> **"Meera files a sighting in one app and opens it in a completely different one, and nobody had to export anything."**

This project implements that workflow using:

- Swarm decentralized storage
- Swarm ID authentication
- Swarm's subsidized gateway
- Content-addressed records
- A documented self-describing binary format
- Completely independent Writer and Reader applications

---

# 🚀 Live Demo

## Writer

Create and upload bird sightings.

**Live:**  
https://road-to-devcon-v-birders-writer.vercel.app/

The Writer requires Swarm ID authentication before uploading.

---

## Independent Reader

Retrieve a sighting directly from Swarm using its content reference.

**Live:**  
https://road-to-devcon-v-birders-reader.vercel.app/

No account is required to read a record.

---

## 🌐 Public Example Record

Here is a real record uploaded to Swarm through the production Writer.

### Peacock — Koradi Lake, Nagpur

**Open directly in the Reader:**

https://road-to-devcon-v-birders-reader.vercel.app/?ref=d2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4

**Swarm reference:**

```text
d2eb98083a7f9ce0f7e782727496e2ef3051c359643f587331abf1918ce3a6e4