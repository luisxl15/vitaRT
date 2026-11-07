#include "WinCryptoOperations.h"

#include <cstdint>
#include <cstring>
#include <vector>
#include <wmmintrin.h>
#include <windows.h>
#include <bcrypt.h>

#pragma comment(lib, "bcrypt.lib")

namespace {

template <int R> __m128i expand(__m128i k) {
    __m128i t = _mm_aeskeygenassist_si128(k, R);
    t = _mm_shuffle_epi32(t, 0xff);
    k = _mm_xor_si128(k, _mm_slli_si128(k, 4));
    k = _mm_xor_si128(k, _mm_slli_si128(k, 4));
    k = _mm_xor_si128(k, _mm_slli_si128(k, 4));
    return _mm_xor_si128(k, t);
}

int hash(BCRYPT_ALG_HANDLE alg, const unsigned char *key, int key_size, const unsigned char *src, int size, unsigned char *dst, int n) {
    return BCryptHash(alg, (PUCHAR)key, (ULONG)key_size, (PUCHAR)src, (ULONG)size, dst, (ULONG)n) == 0 ? 0 : -1;
}

void ctr_add(unsigned char *iv, uint64_t add) {
    for (int i = 15; i >= 0; i--) {
        add += iv[i];
        iv[i] = (unsigned char)add;
        add >>= 8;
    }
}

} // namespace

Aes128::Aes128(const unsigned char *key) {
    __m128i k[11];
    k[0] = _mm_loadu_si128((const __m128i *)key);
    k[1] = expand<0x01>(k[0]);
    k[2] = expand<0x02>(k[1]);
    k[3] = expand<0x04>(k[2]);
    k[4] = expand<0x08>(k[3]);
    k[5] = expand<0x10>(k[4]);
    k[6] = expand<0x20>(k[5]);
    k[7] = expand<0x40>(k[6]);
    k[8] = expand<0x80>(k[7]);
    k[9] = expand<0x1b>(k[8]);
    k[10] = expand<0x36>(k[9]);
    for (int i = 0; i < 11; i++) _mm_store_si128((__m128i *)enc[i], k[i]);
    _mm_store_si128((__m128i *)dec[0], k[10]);
    for (int i = 1; i < 10; i++) _mm_store_si128((__m128i *)dec[i], _mm_aesimc_si128(k[10 - i]));
    _mm_store_si128((__m128i *)dec[10], k[0]);
}

void Aes128::encrypt(const unsigned char *in, unsigned char *out, size_t blocks) const {
    for (size_t b = 0; b < blocks; b++) {
        __m128i x = _mm_xor_si128(_mm_loadu_si128((const __m128i *)(in + 16 * b)), _mm_load_si128((const __m128i *)enc[0]));
        for (int r = 1; r < 10; r++) x = _mm_aesenc_si128(x, _mm_load_si128((const __m128i *)enc[r]));
        _mm_storeu_si128((__m128i *)(out + 16 * b), _mm_aesenclast_si128(x, _mm_load_si128((const __m128i *)enc[10])));
    }
}

void Aes128::decrypt(const unsigned char *in, unsigned char *out, size_t blocks) const {
    for (size_t b = 0; b < blocks; b++) {
        __m128i x = _mm_xor_si128(_mm_loadu_si128((const __m128i *)(in + 16 * b)), _mm_load_si128((const __m128i *)dec[0]));
        for (int r = 1; r < 10; r++) x = _mm_aesdec_si128(x, _mm_load_si128((const __m128i *)dec[r]));
        _mm_storeu_si128((__m128i *)(out + 16 * b), _mm_aesdeclast_si128(x, _mm_load_si128((const __m128i *)dec[10])));
    }
}

int WinCryptoOperations::aes_cbc_encrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size,
                                         unsigned char *iv) const {
    if (key_size != 128 || size % 16) return -1;
    const Aes128 a(key);
    unsigned char c[16];
    std::memcpy(c, iv, 16);
    for (int o = 0; o < size; o += 16) {
        unsigned char x[16];
        for (int i = 0; i < 16; i++) x[i] = src[o + i] ^ c[i];
        a.encrypt(x, c, 1);
        std::memcpy(dst + o, c, 16);
    }
    if (size) std::memcpy(iv, c, 16);
    return 0;
}

int WinCryptoOperations::aes_cbc_decrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size,
                                         unsigned char *iv) const {
    if (key_size != 128 || size % 16) return -1;
    if (!size) return 0;
    const Aes128 a(key);
    std::vector<unsigned char> tmp(src, src + size); // src e dst podem ser o mesmo buffer
    a.decrypt(tmp.data(), dst, size / 16);
    for (int i = 0; i < 16; i++) dst[i] ^= iv[i];
    for (int o = 16; o < size; o++) dst[o] ^= tmp[o - 16];
    std::memcpy(iv, tmp.data() + size - 16, 16);
    return 0;
}

int WinCryptoOperations::aes_ctr_encrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size,
                                         unsigned char *iv) {
    if (key_size != 128) return -1;
    const Aes128 a(key);
    unsigned char ctr[16], ks[16];
    std::memcpy(ctr, iv, 16);
    for (int o = 0; o < size; o += 16) {
        a.encrypt(ctr, ks, 1);
        const int n = size - o < 16 ? size - o : 16;
        for (int i = 0; i < n; i++) dst[o + i] = src[o + i] ^ ks[i];
        ctr_add(ctr, 1);
    }
    ctr_add(iv, (uint64_t)size / 16);
    return 0;
}

int WinCryptoOperations::aes_ctr_decrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size,
                                         unsigned char *iv) {
    return aes_ctr_encrypt(src, dst, size, key, key_size, iv);
}

int WinCryptoOperations::aes_ecb_encrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const {
    if (key_size != 128 || size % 16) return -1;
    Aes128(key).encrypt(src, dst, size / 16);
    return 0;
}

int WinCryptoOperations::aes_ecb_decrypt(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const {
    if (key_size != 128 || size % 16) return -1;
    Aes128(key).decrypt(src, dst, size / 16);
    return 0;
}

// AES-CMAC (RFC 4493)
int WinCryptoOperations::aes_cmac(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const {
    if (key_size != 128) return -1;
    const Aes128 a(key);
    unsigned char L[16] = {}, K1[16], K2[16];
    a.encrypt(L, L, 1);
    auto dbl = [](const unsigned char *in, unsigned char *out) {
        const unsigned char carry = in[0] & 0x80;
        for (int i = 0; i < 15; i++) out[i] = (unsigned char)(in[i] << 1 | in[i + 1] >> 7);
        out[15] = (unsigned char)(in[15] << 1);
        if (carry) out[15] ^= 0x87;
    };
    dbl(L, K1);
    dbl(K1, K2);
    const int n = size ? (size + 15) / 16 : 1;
    const bool full = size && size % 16 == 0;
    unsigned char x[16] = {}, y[16];
    for (int b = 0; b < n - 1; b++) {
        for (int i = 0; i < 16; i++) y[i] = x[i] ^ src[16 * b + i];
        a.encrypt(y, x, 1);
    }
    unsigned char last[16] = {};
    const int rem = size - 16 * (n - 1);
    std::memcpy(last, src + 16 * (n - 1), rem);
    if (full) {
        for (int i = 0; i < 16; i++) last[i] ^= K1[i];
    } else {
        last[rem] = 0x80;
        for (int i = 0; i < 16; i++) last[i] ^= K2[i];
    }
    for (int i = 0; i < 16; i++) y[i] = x[i] ^ last[i];
    a.encrypt(y, dst, 1);
    return 0;
}

int WinCryptoOperations::sha1(const unsigned char *src, unsigned char *dst, int size) const {
    return hash(BCRYPT_SHA1_ALG_HANDLE, nullptr, 0, src, size, dst, 20);
}
int WinCryptoOperations::sha256(const unsigned char *src, unsigned char *dst, int size) const {
    return hash(BCRYPT_SHA256_ALG_HANDLE, nullptr, 0, src, size, dst, 32);
}
int WinCryptoOperations::hmac_sha1(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const {
    return hash(BCRYPT_HMAC_SHA1_ALG_HANDLE, key, key_size, src, size, dst, 20);
}
int WinCryptoOperations::hmac_sha256(const unsigned char *src, unsigned char *dst, int size, const unsigned char *key, int key_size) const {
    return hash(BCRYPT_HMAC_SHA256_ALG_HANDLE, key, key_size, src, size, dst, 32);
}
