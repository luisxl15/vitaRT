// Extrai o app do PS Vita direto do PKG, já decifrado, para o instalador (apps/instalador/motor.js).
//
//   pfs_extrair.exe <jogo.pkg> <work.bin> <destino>      -> <destino>\<TITLE_ID>\...
//
// Duas camadas: a do PKG (AES-128-CTR com a chave pública do formato, como em tools/vitapkg.py) vai para uma pasta
// temporária ao lado do destino, e o PFS do app sai decifrado com o klicensee da licença (work.bin +0x50) pelo
// psvpfsparser (third_party/psvpfsparser). Sem OpenSSL: AES-NI e BCrypt.
// Saída para o instalador, uma por linha: "etapa pkg|pfs", "progresso <feito> <total>", "pronto <pasta>" ou
// "erro <texto>". Código de saída 0 = ok.
#include "F00DKeyEncryptorFactory.h"
#include "CryptoOperationsFactory.h"
#include "LocalKeyGenerator.h"
#include "PfsFilesystem.h"
#include "WinCryptoOperations.h"

#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace {

const unsigned char kPspKey[16] = {0x07, 0xf2, 0xc6, 0x82, 0x90, 0xb5, 0x0d, 0x2c, 0x33, 0x81, 0x8d, 0x70, 0x9b, 0x60, 0xe6, 0x2b};
const unsigned char kVitaKeys[3][16] = {
    {0xe3, 0x1a, 0x70, 0xc9, 0xce, 0x1d, 0xd7, 0x2b, 0xf3, 0xc0, 0x62, 0x29, 0x63, 0xf2, 0xec, 0xcb},
    {0x42, 0x3a, 0xca, 0x3a, 0x2b, 0xd5, 0x64, 0x9f, 0x96, 0x86, 0xab, 0xad, 0x6f, 0xd8, 0x80, 0x1f},
    {0xaf, 0x07, 0xfd, 0x59, 0x65, 0x25, 0x27, 0xba, 0xf1, 0x33, 0x89, 0x66, 0x8b, 0x28, 0xa9, 0x02}};

[[noreturn]] void erro(const std::string &s) {
    std::printf("erro %s\n", s.c_str());
    std::fflush(stdout);
    std::exit(1);
}

uint32_t be32(const unsigned char *p) { return (uint32_t)p[0] << 24 | p[1] << 16 | p[2] << 8 | p[3]; }
uint64_t be64(const unsigned char *p) { return (uint64_t)be32(p) << 32 | be32(p + 4); }

struct Pkg {
    FILE *f = nullptr;
    unsigned char iv[16];
    Aes128 *aes = nullptr;
    uint64_t enc_offset = 0;
    std::string content_id;
    struct Item {
        std::string name;
        uint64_t off, size;
        bool dir;
    };
    std::vector<Item> items;

    // decifra size bytes a partir de enc_offset + rel (o contador do CTR é iv + rel / 16)
    void read(uint64_t rel, unsigned char *out, size_t size) {
        const uint64_t start = rel & ~15ull, skip = rel - start;
        std::vector<unsigned char> buf((size_t)(skip + size + 15) & ~(size_t)15);
        _fseeki64(f, (long long)(enc_offset + start), SEEK_SET);
        const size_t got = std::fread(buf.data(), 1, buf.size(), f);
        if (got < skip + size) erro("PKG cortado (arquivo incompleto?)");
        unsigned char ctr[16];
        std::memcpy(ctr, iv, 16);
        uint64_t add = start / 16;
        for (int i = 15; i >= 0 && add; i--) {
            add += ctr[i];
            ctr[i] = (unsigned char)add;
            add >>= 8;
        }
        const size_t nb = buf.size() / 16;
        std::vector<unsigned char> ks(nb * 16);
        for (size_t b = 0; b < nb; b++) {
            std::memcpy(&ks[16 * b], ctr, 16);
            for (int i = 15; i >= 0; i--)
                if (++ctr[i]) break;
        }
        aes->encrypt(ks.data(), ks.data(), nb);
        for (size_t i = 0; i < size; i++) out[i] = buf[skip + i] ^ ks[skip + i];
    }

    void open(const fs::path &p) {
        f = _wfopen(p.wstring().c_str(), L"rb");
        if (!f) erro("não abriu o PKG");
        unsigned char h[0x100];
        if (std::fread(h, 1, sizeof h, f) != sizeof h || std::memcmp(h, "\x7fPKG", 4)) erro("não é um PKG");
        const uint32_t item_count = be32(h + 20);
        enc_offset = be64(h + 32);
        content_id.assign((const char *)h + 0x30, strnlen((const char *)h + 0x30, 0x30));
        std::memcpy(iv, h + 0x70, 16);
        const int key_type = h[0xE7] & 7;
        unsigned char key[16];
        if (key_type == 1) {
            std::memcpy(key, kPspKey, 16);
        } else if (key_type >= 2 && key_type <= 4) {
            Aes128(kVitaKeys[key_type - 2]).encrypt(iv, key, 1);
        } else {
            erro("tipo de chave do PKG desconhecido");
        }
        aes = new Aes128(key);
        std::vector<unsigned char> table(item_count * 32);
        read(0, table.data(), table.size());
        for (uint32_t i = 0; i < item_count; i++) {
            const unsigned char *e = &table[32 * i];
            Item it;
            const uint32_t name_off = be32(e), name_size = be32(e + 4);
            it.off = be64(e + 8), it.size = be64(e + 16);
            const unsigned char flags = e[27];
            it.dir = flags == 4 || flags == 18;
            std::string name(name_size, '\0');
            read(name_off, (unsigned char *)name.data(), name_size);
            it.name = name;
            items.push_back(it);
        }
    }
};

// conta as linhas do psvpfsparser com um arquivo pronto e manda o progresso ao instalador
class Progresso : public std::stringbuf {
public:
    size_t feito = 0, total = 0;
    int sync() override {
        std::string s = str();
        size_t p;
        while ((p = s.find('\n')) != std::string::npos) {
            const std::string l = s.substr(0, p);
            s.erase(0, p + 1);
            if (!l.rfind("Decrypted:", 0) || !l.rfind("Copied:", 0)) {
                std::printf("progresso %zu %zu\n", ++feito, total);
                std::fflush(stdout);
            } else if (l.rfind("Failed", 0) == 0 || l.rfind("failed", 0) == 0) {
                std::printf("aviso %s\n", l.c_str());
                std::fflush(stdout);
            } else if (!l.empty()) {
                std::printf("log %s\n", l.c_str());
            }
        }
        str(s);
        return 0;
    }
};

} // namespace

int decifrar_pfs(const fs::path &tmp, const fs::path &out, const unsigned char *klicensee, size_t arquivos, bool apagar);

int wmain(int argc, wchar_t **argv) {
    if (argc < 4) {
        std::printf("uso: pfs_extrair <jogo.pkg> <work.bin> <destino>\n");
        return 2;
    }
    const fs::path pkg_p = argv[1], rif_p = argv[2], dst = argv[3];

    // licença: RIF de 512 bytes, content id em +0x10, klicensee em +0x50
    std::ifstream rf(rif_p, std::ios::binary);
    std::vector<unsigned char> rif((std::istreambuf_iterator<char>(rf)), {});
    if (rif.size() < 0x60) erro("work.bin inválido");
    const std::string rif_id((const char *)&rif[0x10], strnlen((const char *)&rif[0x10], 0x30));
    unsigned char klicensee[16];
    std::memcpy(klicensee, &rif[0x50], 16);

    // teste: <jogo.pkg> pode ser uma pasta com a camada do PKG já tirada (tools/vitapkg.py extract); ela fica
    if (fs::is_directory(pkg_p))
        return decifrar_pfs(pkg_p, dst / (rif_id.size() >= 16 ? rif_id.substr(7, 9) : "APP"), klicensee, 0, false);
    Pkg pkg;
    pkg.open(pkg_p);
    if (!rif_id.empty() && rif_id != pkg.content_id) erro("o work.bin é de outro jogo (" + rif_id + ", o PKG é " + pkg.content_id + ")");
    const std::string title = pkg.content_id.size() >= 16 ? pkg.content_id.substr(7, 9) : "APP";

    // 1. camada do PKG -> <destino>\_pkg_<TITLE>
    const fs::path tmp = dst / ("_pkg_" + title), out = dst / title;
    std::error_code ec;
    fs::create_directories(tmp, ec);
    uint64_t total = 0, feito = 0;
    for (const auto &it : pkg.items)
        if (!it.dir) total += it.size;
    std::printf("etapa pkg\n");
    std::vector<unsigned char> buf(8 << 20);
    size_t arquivos = 0;
    for (const auto &it : pkg.items) {
        const fs::path p = tmp / fs::u8path(it.name);
        if (it.dir) {
            fs::create_directories(p, ec);
            continue;
        }
        arquivos++;
        fs::create_directories(p.parent_path(), ec);
        FILE *o = _wfopen(p.wstring().c_str(), L"wb");
        if (!o) erro("não gravou " + it.name + " (disco cheio?)");
        for (uint64_t pos = 0; pos < it.size;) {
            const size_t n = (size_t)std::min<uint64_t>(buf.size(), it.size - pos);
            pkg.read(it.off + pos, buf.data(), n);
            if (std::fwrite(buf.data(), 1, n, o) != n) erro("não gravou " + it.name + " (disco cheio?)");
            pos += n, feito += n;
            std::printf("progresso %llu %llu\n", (unsigned long long)feito, (unsigned long long)total);
            std::fflush(stdout);
        }
        std::fclose(o);
    }

    return decifrar_pfs(tmp, out, klicensee, arquivos, true);
}

// 2. PFS -> <destino>\<TITLE>; apagar = a pasta da camada do PKG foi criada aqui
int decifrar_pfs(const fs::path &tmp, const fs::path &out, const unsigned char *klicensee, size_t arquivos, bool apagar) {
    std::printf("etapa pfs\n");
    std::fflush(stdout);
    std::error_code ec;
    auto cryptops = CryptoOperationsFactory::create(CryptoOperationsTypes::openssl);
    auto f00d = F00DKeyEncryptorFactory::create(F00DEncryptorTypes::native, cryptops);
    Progresso pb;
    pb.total = arquivos;
    std::ostream log(&pb);
    int r = -1;
    try {
        PfsFilesystem pfs(cryptops, f00d, log, klicensee, tmp);
        if (pfs.mount() < 0) log.flush(), erro("PFS não montou (licença errada?)");
        r = pfs.decrypt_files(out);
        log.flush();
        if (r >= 0 && get_keystone(cryptops, out) < 0) r = -1;
    } catch (const std::exception &e) {
        erro(std::string("PFS: ") + e.what());
    }
    if (r < 0) erro("falha ao decifrar o PFS");
    if (apagar) fs::remove_all(tmp, ec); // a camada do PKG ainda cifrada: só ocupava espaço
    std::printf("pronto %s\n", out.u8string().c_str());
    return 0;
}
