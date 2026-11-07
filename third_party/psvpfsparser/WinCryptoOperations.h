#pragma once

#include "ICryptoOperations.h"

// Troca do OpenSSLCryptoOperations (vitart): AES-128 por AES-NI, SHA/HMAC pela BCrypt do Windows. Mesma semântica
// do original: tamanho da chave AES em bits (128), do HMAC em bytes; CBC devolve no iv o último bloco cifrado; CTR
// avança o contador em size / 16.
class WinCryptoOperations : public ICryptoOperations {
public:
    int aes_cbc_encrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size, unsigned char *iv) const override;
    int aes_cbc_decrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size, unsigned char *iv) const override;
    int aes_ctr_encrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size, unsigned char *iv) override;
    int aes_ctr_decrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size, unsigned char *iv) override;
    int aes_ecb_encrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const override;
    int aes_ecb_decrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const override;
    int aes_cmac(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const override;
    int sha1(const unsigned char *src, unsigned char *dst, int size) const override;
    int sha256(const unsigned char *src, unsigned char *dst, int size) const override;
    int hmac_sha1(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const override;
    int hmac_sha256(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const override;
};

// AES-128 em blocos (também usado pela camada externa do PKG em pfs_extrair.cpp).
struct Aes128 {
    alignas(16) unsigned char enc[11][16], dec[11][16];
    explicit Aes128(const unsigned char *key);
    void encrypt(const unsigned char *in, unsigned char *out, size_t blocks) const;
    void decrypt(const unsigned char *in, unsigned char *out, size_t blocks) const;
};
