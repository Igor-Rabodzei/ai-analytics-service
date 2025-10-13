"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Емуляція перевірки логіну/пароля
    const validUsername = process.env.NEXT_PUBLIC_AUTH_USERNAME || "admin";
    const validPassword = process.env.NEXT_PUBLIC_AUTH_PASSWORD || "password";

    // Симуляція затримки API
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (username === validUsername && password === validPassword) {
      // Зберігаємо флаг авторизації в localStorage
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("username", username);

      // Встановлюємо cookie для middleware
      document.cookie = "auth-token=authenticated; path=/; max-age=86400"; // 24 години

      // Перенаправляємо на головну сторінку
      router.push("/");
    } else {
      setError("Невірний логін або пароль");
    }

    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-center text-2xl font-bold">Вхід</CardTitle>
          <CardDescription className="text-center">
            Введіть свої дані для входу в систему
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Логін
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Введіть логін"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Пароль
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введіть пароль"
                required
                disabled={isLoading}
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Вхід..." : "Увійти"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
