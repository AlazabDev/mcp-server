import axios, { AxiosInstance } from "axios";
import { DaftraConfig, ApiResponse } from "./types.js";

export class DaftraClient {
  private http: AxiosInstance;
  private baseUrl: string;

  constructor(config: DaftraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "Content-Type": "application/json",
    };

    if (config.apiKey) {
      headers["apikey"] = config.apiKey;
    }
    if (config.accessToken) {
      headers["Authorization"] = `Bearer ${config.accessToken}`;
    }

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers,
      timeout: 60000,
    });
  }

  async get<T = any>(path: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    try {
      const response = await this.http.get(path, { params });
      return response.data;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async post<T = any>(path: string, body?: any, params?: Record<string, any>): Promise<ApiResponse<T>> {
    try {
      const response = await this.http.post(path, body, { params });
      return response.data;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async put<T = any>(path: string, body?: any): Promise<ApiResponse<T>> {
    try {
      const response = await this.http.put(path, body);
      return response.data;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async delete<T = any>(path: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    try {
      const response = await this.http.delete(path, { params });
      return response.data;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  private handleError(error: any): ApiResponse {
    if (error.response) {
      return {
        result: "failed",
        code: error.response.status,
        message: error.response.data?.message || error.message,
        data: error.response.data,
      };
    }
    return {
      result: "failed",
      code: 500,
      message: error.message || "Unknown error",
    };
  }
}