#include <stdexcept>

#include "CryptoOperationsFactory.h"
#include "WinCryptoOperations.h" // vitart: no lugar do OpenSSL

std::shared_ptr<ICryptoOperations> CryptoOperationsFactory::create(CryptoOperationsTypes type)
{
   switch(type)
   {
   case CryptoOperationsTypes::openssl:
      return std::make_shared<WinCryptoOperations>();
   default:
      throw std::runtime_error("unexpected CryptoOperationsTypes value");
   }
}
