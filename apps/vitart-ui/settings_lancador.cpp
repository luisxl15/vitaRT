// "Settings.exe": fica na raiz do jogo, ao lado do "God of War Collection.exe", e só abre o vitart Settings de verdade
// (o Electron em Ferramentas\vitart-ui; na pasta rt de desenvolvimento, em vitart-ui), como o lançador de um jogo.
#include <windows.h>
#include <string>

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
    wchar_t self[MAX_PATH];
    GetModuleFileNameW(nullptr, self, MAX_PATH);
    std::wstring dir(self);
    dir.resize(dir.find_last_of(L"\\/") + 1);
    for (const wchar_t *sub : {L"Ferramentas\\vitart-ui\\", L"vitart-ui\\"}) {
        const std::wstring pasta = dir + sub, exe = pasta + L"vitart Settings.exe";
        if (GetFileAttributesW(exe.c_str()) == INVALID_FILE_ATTRIBUTES) continue;
        std::wstring cmd = L"\"" + exe + L"\"";
        STARTUPINFOW si{sizeof si};
        PROCESS_INFORMATION pi{};
        if (!CreateProcessW(exe.c_str(), cmd.data(), nullptr, nullptr, FALSE, 0, nullptr, pasta.c_str(), &si, &pi)) break;
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        return 0;
    }
    MessageBoxW(nullptr, L"Não achei o vitart Settings (Ferramentas\\vitart-ui\\vitart Settings.exe) ao lado deste arquivo.",
                L"God of War Collection", MB_ICONERROR);
    return 1;
}
