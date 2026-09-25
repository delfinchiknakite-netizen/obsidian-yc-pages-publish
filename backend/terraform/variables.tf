variable "cloud_id" {
  type        = string
  description = "YC cloud id"
}

variable "folder_id" {
  type        = string
  description = "YC folder id (по умолчанию — default folder)"
}

variable "bucket_name" {
  type        = string
  description = "Глобально уникальное имя бакета для страниц"
}

variable "create_token" {
  type        = string
  sensitive   = true
  description = "Секретный токен, который проверяет функция при создании страницы"
}
