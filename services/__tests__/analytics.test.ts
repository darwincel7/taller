import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTechnicianLeaderboard } from '../analytics';
import { supabase } from '../supabase';
import { OrderStatus } from '../../types';

// Mock Supabase
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          gte: vi.fn(() => ({
            lte: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      }))
    }))
  }
}));

describe('fetchTechnicianLeaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly aggregate points for a single technician', async () => {
    const mockData = [
      { assignedTo: 'tech1', pointsAwarded: 10, pointsSplit: null, status: OrderStatus.REPAIRED, completedAt: Date.now() },
      { assignedTo: 'tech1', pointsAwarded: 5, pointsSplit: null, status: OrderStatus.REPAIRED, completedAt: Date.now() },
    ];

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: mockData, error: null })
          })
        })
      })
    });

    const result = await fetchTechnicianLeaderboard();
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ techId: 'tech1', points: 15 });
  });

  it('should correctly handle split points between two technicians', async () => {
    const mockData = [
      { 
        assignedTo: 'tech1', 
        pointsAwarded: 10, 
        pointsSplit: { primaryTechId: 'tech1', primaryPoints: 7, secondaryTechId: 'tech2', secondaryPoints: 3 }, 
        status: OrderStatus.REPAIRED, 
        completedAt: Date.now() 
      }
    ];

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: mockData, error: null })
          })
        })
      })
    });

    const result = await fetchTechnicianLeaderboard();
    
    expect(result).toHaveLength(2);
    expect(result.find(r => r.techId === 'tech1')?.points).toBe(7);
    expect(result.find(r => r.techId === 'tech2')?.points).toBe(3);
  });

  it('should return empty array if no data is found', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })
    });

    const result = await fetchTechnicianLeaderboard();
    expect(result).toEqual([]);
  });
});
