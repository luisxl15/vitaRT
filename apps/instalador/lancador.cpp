// "Instalar God of War Collection.exe": fica na raiz do instalador e só abre o instalador de verdade
// (instalador\Instalador.exe, o Electron), para a raiz ter um exe só, como num instalador de jogo.
#include <windows.h>
#include <string>

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
    wchar_t self[MAX_PATH];
    GetModuleFileNameW(nullptr, self, MAX_PATH);
    std::wstring dir(self);
    dir.resize(dir.find_last_of(L"\\/") + 1);
    std::wstring exe = dir + L"instalador\\Instalador.exe";
    std::wstring cmd = L"\"" + exe + L"\"";
    STARTUPINFOW si{sizeof si};
    PROCESS_INFORMATION pi{};
    if (!CreateProcessW(exe.c_str(), cmd.data(), nullptr, nullptr, FALSE, 0, nullptr, (dir + L"instalador").c_str(), &si, &pi)) {
        MessageBoxW(nullptr, L"Não achei a pasta \"instalador\" ao lado deste arquivo. Copie o instalador inteiro (com as pastas instalador e dados).",
                    L"God of War Collection", MB_ICONERROR);
        return 1;
    }
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 0;
}
